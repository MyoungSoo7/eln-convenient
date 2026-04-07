/**
 * Redis Stream Event Consumer — 통합검색 자동 동기화
 *
 * labnote:events 스트림에서 SEARCH_INDEX / SEARCH_DELETE 이벤트를 소비하여
 * OpenSearch에 반영한다.
 *
 * 발행 측: eln-service, inventory-service의 searchClient.ts (Redis XADD)
 * 구독 측: 이 컨슈머 (Consumer Group: search-service)
 *
 * 특징:
 *   - Consumer Group 방식 → search-service 인스턴스가 여러 개여도 1회만 처리
 *   - XPENDING + XCLAIM으로 orphan 메시지 자동 재시도
 *   - 5회 초과 실패 시 dead letter (XACK로 제거 + 에러 로그)
 *   - search-service 다운 중 발행된 이벤트는 Stream에 보존 → 복구 시 자동 처리
 *
 * eln-service의 eventConsumer.ts와 동일 패턴 — 로직 변경 시 양쪽 참고.
 */
import Redis from 'ioredis';
import { createLogger } from '@lab/shared';
import { indexDocument, softDeleteDocument } from './opensearch';
import { invalidateSearchCache } from './redis';

const logger = createLogger('search-event-consumer');

const EVENT_STREAM = 'labnote:events';
const GROUP_NAME = 'search-service';
const CONSUMER_NAME = `search-${process.pid}`;
const BLOCK_MS = 5000;
const BATCH_SIZE = 20;
const CLAIM_INTERVAL_MS = 60000;
const CLAIM_MIN_IDLE_MS = 30000;
const MAX_DELIVERY_COUNT = 5;

let running = false;
let redis: Redis | null = null;

/** 실행 상태 조회 */
export function isSearchEventConsumerRunning(): boolean {
  return running && redis !== null;
}

/** Redis Stream field-value 배열 → 객체 */
function parseFields(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return obj;
}

/** SEARCH_INDEX 이벤트 처리 */
async function handleSearchIndex(data: Record<string, string>): Promise<void> {
  const { id, doc: docJson } = data;
  if (!id || !docJson) {
    logger.warn({ data }, 'SEARCH_INDEX 이벤트에 필수 필드 누락');
    return;
  }
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(docJson);
  } catch (err) {
    logger.error({ err, docJson }, 'SEARCH_INDEX doc JSON 파싱 실패');
    return; // 파싱 실패는 재시도해도 무의미 → 그냥 ack되도록 성공 처리
  }
  // docStatus 기본값 보장 (발행 측에서 빠졌을 경우 대비)
  await indexDocument(id, { ...doc, docStatus: doc.docStatus ?? 'active' });
}

/** SEARCH_DELETE 이벤트 처리 */
async function handleSearchDelete(data: Record<string, string>): Promise<void> {
  const { id } = data;
  if (!id) {
    logger.warn({ data }, 'SEARCH_DELETE 이벤트에 id 누락');
    return;
  }
  await softDeleteDocument(id);
}

/** 메시지 디스패처 */
async function processMessage(messageId: string, fields: string[]): Promise<boolean> {
  const data = parseFields(fields);
  const type = data.type;

  try {
    switch (type) {
      case 'SEARCH_INDEX':
        await handleSearchIndex(data);
        await invalidateSearchCache().catch(() => {});
        break;
      case 'SEARCH_DELETE':
        await handleSearchDelete(data);
        await invalidateSearchCache().catch(() => {});
        break;
      default:
        // 다른 서비스용 이벤트 (NOTE_SIGNED 등) — 무시하고 ACK
        break;
    }
    return true;
  } catch (err) {
    logger.error({ messageId, type, err }, '메시지 처리 실패');
    return false;
  }
}

/** 메인 소비 루프 */
async function consumeLoop(): Promise<void> {
  while (running && redis) {
    try {
      const results = await redis.xreadgroup(
        'GROUP', GROUP_NAME, CONSUMER_NAME,
        'COUNT', BATCH_SIZE,
        'BLOCK', BLOCK_MS,
        'STREAMS', EVENT_STREAM, '>',
      ) as any;

      if (!results) continue;

      for (const [_stream, messages] of results) {
        for (const [msgId, fields] of messages) {
          const ok = await processMessage(msgId, fields);
          if (ok) {
            await redis.xack(EVENT_STREAM, GROUP_NAME, msgId);
          }
        }
      }
    } catch (err: any) {
      if (!running) break;
      logger.error({ err: err.message }, '소비 루프 오류');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Pending 메시지 복구 루프 */
async function claimLoop(): Promise<void> {
  while (running && redis) {
    await new Promise((r) => setTimeout(r, CLAIM_INTERVAL_MS));
    if (!running || !redis) break;

    try {
      const pending = await redis.xpending(
        EVENT_STREAM, GROUP_NAME,
        '-', '+', '20',
      ) as any[];

      if (!pending || pending.length === 0) continue;

      for (const entry of pending) {
        const [msgId, _consumer, idleMs, deliveryCount] = entry;
        if (idleMs < CLAIM_MIN_IDLE_MS) continue;

        if (deliveryCount >= MAX_DELIVERY_COUNT) {
          logger.error({ msgId, deliveryCount }, 'dead letter: 재시도 횟수 초과');
          await redis.xack(EVENT_STREAM, GROUP_NAME, msgId);
          continue;
        }

        const claimed = await redis.xclaim(
          EVENT_STREAM, GROUP_NAME, CONSUMER_NAME,
          CLAIM_MIN_IDLE_MS, msgId,
        ) as any[];

        for (const msg of claimed) {
          if (!msg) continue;
          const [claimedId, fields] = msg;
          const ok = await processMessage(claimedId, fields);
          if (ok) {
            await redis.xack(EVENT_STREAM, GROUP_NAME, claimedId);
          }
        }
      }
    } catch (err: any) {
      if (!running) break;
      logger.error({ err: err.message }, 'claim 루프 오류');
    }
  }
}

/** Consumer 시작 */
export async function startSearchEventConsumer(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    redis.on('error', (err: Error) => {
      logger.error({ err: err.message }, 'Redis 연결 오류');
    });
  } catch (err) {
    logger.warn({ err }, 'Redis 연결 실패 — 이벤트 소비 비활성화');
    return;
  }

  // Consumer Group 생성 (이미 있으면 무시)
  try {
    await redis.xgroup('CREATE', EVENT_STREAM, GROUP_NAME, '0', 'MKSTREAM');
    logger.info({ group: GROUP_NAME }, 'Consumer Group 생성');
  } catch (err: any) {
    if (err.message?.includes('BUSYGROUP')) {
      // 이미 존재 — 정상
    } else {
      logger.error({ err: err.message }, 'Consumer Group 생성 실패');
      redis.disconnect();
      redis = null;
      return;
    }
  }

  running = true;
  logger.info({ consumer: CONSUMER_NAME, group: GROUP_NAME }, '이벤트 컨슈머 시작');

  // 두 루프 병렬 실행
  consumeLoop();
  claimLoop();
}

/** Consumer 종료 (Graceful Shutdown) */
export async function stopSearchEventConsumer(): Promise<void> {
  running = false;
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
  logger.info('이벤트 컨슈머 종료');
}
