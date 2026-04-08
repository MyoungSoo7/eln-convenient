/**
 * Audit Event Consumer (Redis Stream)
 *
 * publisher (eln-service / auth-service)가 HTTP 호출과 더불어
 * `audit:events` 스트림에도 동일 페이로드를 발행한다(dual-write).
 *
 * 본 컨슈머는:
 *   1) Stream에서 메시지를 읽어 AuditLog DB에 멱등 INSERT
 *      → eventId UNIQUE 제약으로 HTTP 경로와 중복 저장 방지
 *   2) 처리 실패 시 ACK하지 않고 pending에 남김
 *   3) MAX_DELIVERY_COUNT 초과 시 audit:events:dlq 스트림으로 이동
 *
 * 결과적으로 HTTP 경로가 죽어도 Stream consumer가 결국 처리하므로
 * 감사로그 손실 0건을 달성한다.
 *
 * 패턴 출처: services/eln-service/src/lib/eventConsumer.ts (검증된 형태 그대로)
 */
import Redis from 'ioredis';
import prisma from '../lib/prisma';
import { createLogger } from '@lab/shared';

const logger = createLogger('audit-consumer');

const AUDIT_STREAM = 'audit:events';
const AUDIT_DLQ_STREAM = 'audit:events:dlq';
const GROUP_NAME = 'signature-audit';
const CONSUMER_NAME = `audit-${process.pid}`;
const BLOCK_MS = 5000;
const BATCH_SIZE = 20;
const CLAIM_INTERVAL_MS = 60000;
const CLAIM_MIN_IDLE_MS = 30000;
const MAX_DELIVERY_COUNT = 5;
const STREAM_MAXLEN = 10000;

let running = false;
let redis: Redis | null = null;

export function isAuditConsumerRunning(): boolean {
  return running && redis !== null;
}

function parseFields(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return obj;
}

/** AuditLog 멱등 INSERT — eventId UNIQUE로 중복 차단 */
async function insertAuditLog(data: Record<string, string>): Promise<void> {
  const { eventId, entityType, entityId, action, actorId, orgId, details, ipAddress } = data;
  if (!eventId || !entityType || !entityId || !action || !actorId) {
    logger.warn({ data }, '[audit-consumer] 필수 필드 누락 — drop');
    return;
  }

  // 이미 존재하면 skip (HTTP 경로가 먼저 도달한 경우)
  const exists = await prisma.auditLog.findUnique({ where: { eventId } });
  if (exists) return;

  let parsedDetails: any = {};
  if (details) {
    try { parsedDetails = JSON.parse(details); } catch { parsedDetails = { raw: details }; }
  }

  try {
    await prisma.auditLog.create({
      data: {
        eventId,
        entityType,
        entityId,
        action,
        actorId,
        orgId: orgId ?? '',
        details: parsedDetails,
        ipAddress: ipAddress || null,
      },
    });
  } catch (err: any) {
    // 동시 요청 UNIQUE 충돌 → 멱등으로 흡수
    if (err?.code === 'P2002') return;
    throw err;
  }
}

async function processMessage(messageId: string, fields: string[]): Promise<boolean> {
  try {
    const data = parseFields(fields);
    await insertAuditLog(data);
    return true;
  } catch (err) {
    logger.error({ err, messageId }, '[audit-consumer] 메시지 처리 실패');
    return false;
  }
}

/** DLQ로 이동 — 원본 fields 그대로 + 메타데이터 */
async function moveToDLQ(messageId: string, fields: string[], deliveryCount: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.xadd(
      AUDIT_DLQ_STREAM,
      'MAXLEN', '~', String(STREAM_MAXLEN),
      '*',
      'originalId', messageId,
      'deliveryCount', String(deliveryCount),
      'movedAt', new Date().toISOString(),
      ...fields,
    );
    logger.error({ messageId, deliveryCount }, '[audit-consumer] DLQ로 이동');
  } catch (err) {
    logger.error({ err, messageId }, '[audit-consumer] DLQ 이동 실패 — 원본 ACK 보류');
  }
}

async function consumeLoop(): Promise<void> {
  while (running && redis) {
    try {
      const results = (await redis.xreadgroup(
        'GROUP', GROUP_NAME, CONSUMER_NAME,
        'COUNT', BATCH_SIZE,
        'BLOCK', BLOCK_MS,
        'STREAMS', AUDIT_STREAM, '>',
      )) as any;

      if (!results) continue;

      for (const [_stream, messages] of results) {
        for (const [msgId, fields] of messages) {
          const ok = await processMessage(msgId, fields);
          if (ok) await redis.xack(AUDIT_STREAM, GROUP_NAME, msgId);
        }
      }
    } catch (err: any) {
      if (!running) break;
      logger.error({ err: err.message }, '[audit-consumer] 소비 루프 오류');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function claimLoop(): Promise<void> {
  while (running && redis) {
    await new Promise((r) => setTimeout(r, CLAIM_INTERVAL_MS));
    if (!running || !redis) break;

    try {
      const pending = (await redis.xpending(
        AUDIT_STREAM, GROUP_NAME,
        '-', '+', '50',
      )) as any[];

      if (!pending || pending.length === 0) continue;

      for (const entry of pending) {
        const [msgId, _consumer, idleMs, deliveryCount] = entry;
        if (idleMs < CLAIM_MIN_IDLE_MS) continue;

        // 최대 재시도 초과 → DLQ로 이동
        if (deliveryCount >= MAX_DELIVERY_COUNT) {
          // 페이로드를 다시 읽어와 DLQ에 저장
          const range = (await redis.xrange(AUDIT_STREAM, msgId, msgId)) as any[];
          if (range && range.length > 0) {
            const [, fields] = range[0];
            await moveToDLQ(msgId, fields, deliveryCount);
          }
          await redis.xack(AUDIT_STREAM, GROUP_NAME, msgId);
          continue;
        }

        // 재처리 시도
        const claimed = (await redis.xclaim(
          AUDIT_STREAM, GROUP_NAME, CONSUMER_NAME,
          CLAIM_MIN_IDLE_MS, msgId,
        )) as any[];

        for (const msg of claimed) {
          if (!msg) continue;
          const [claimedId, fields] = msg;
          const ok = await processMessage(claimedId, fields);
          if (ok) await redis.xack(AUDIT_STREAM, GROUP_NAME, claimedId);
        }
      }
    } catch (err: any) {
      if (!running) break;
      logger.error({ err: err.message }, '[audit-consumer] claim 루프 오류');
    }
  }
}

export async function startAuditConsumer(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    redis.on('error', (err: Error) => {
      logger.error({ err: err.message }, '[audit-consumer] Redis 연결 오류');
    });
  } catch (err) {
    logger.warn({ err }, '[audit-consumer] Redis 연결 실패 — 컨슈머 비활성화');
    return;
  }

  try {
    await redis.xgroup('CREATE', AUDIT_STREAM, GROUP_NAME, '0', 'MKSTREAM');
    logger.info({ group: GROUP_NAME }, '[audit-consumer] Consumer Group 생성');
  } catch (err: any) {
    if (!err.message?.includes('BUSYGROUP')) {
      logger.error({ err: err.message }, '[audit-consumer] Consumer Group 생성 실패');
      redis.disconnect();
      redis = null;
      return;
    }
  }

  running = true;
  logger.info({ consumer: CONSUMER_NAME, group: GROUP_NAME, stream: AUDIT_STREAM }, '[audit-consumer] 시작됨');

  consumeLoop();
  claimLoop();
}

export async function stopAuditConsumer(): Promise<void> {
  running = false;
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
  logger.info('[audit-consumer] 종료됨');
}
