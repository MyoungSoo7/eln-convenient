/**
 * Redis Stream Event Consumer
 *
 * labnote:events 스트림에서 이벤트를 소비하여 처리합니다.
 * - NOTE_SIGNED: 노트 상태를 'signed'로 변경 + 상태 이력 기록
 *
 * Consumer Group: eln-service
 * 장애 복구: 60초마다 pending 메시지를 XCLAIM하여 재처리
 * Graceful Shutdown: SIGTERM/SIGINT 시 루프 중단
 */
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import prisma from './prisma';

const EVENT_STREAM = 'labnote:events';
const GROUP_NAME = 'eln-service';
const CONSUMER_NAME = `eln-${process.pid}`;
const BLOCK_MS = 5000;           // XREADGROUP 블록 타임아웃
const BATCH_SIZE = 10;           // 한 번에 읽는 메시지 수
const CLAIM_INTERVAL_MS = 60000; // pending 메시지 복구 주기
const CLAIM_MIN_IDLE_MS = 30000; // 이 시간 이상 미처리된 메시지만 XCLAIM
const MAX_DELIVERY_COUNT = 5;    // 이 횟수 이상 재시도된 메시지는 dead letter 처리

let running = false;
let redis: Redis | null = null;

/** 이벤트 컨슈머 실행 상태 조회 */
export function isEventConsumerRunning(): boolean {
  return running && redis !== null;
}

/** 이벤트 메시지 파싱 (Redis Stream의 field-value 배열 → 객체) */
function parseFields(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return obj;
}

/** NOTE_SIGNED 이벤트 처리: 노트 상태 → signed + 이력 기록 */
async function handleNoteSigned(data: Record<string, string>): Promise<void> {
  const { noteId, userId, status } = data;
  if (!noteId || !status) {
    console.warn('[event-consumer] NOTE_SIGNED 이벤트에 필수 필드 누락:', data);
    return;
  }

  // 이미 signed 상태이면 스킵 (멱등성 보장)
  const note = await prisma.note.findUnique({ where: { id: noteId }, select: { status: true } });
  if (!note) {
    console.warn(`[event-consumer] 노트 없음: ${noteId}`);
    return;
  }
  if (note.status === 'signed') {
    return; // 이미 처리됨
  }

  // 상태 전환 검증 (in_progress → signed만 허용)
  if (note.status !== 'in_progress') {
    console.warn(`[event-consumer] 상태 전환 불가: ${note.status} → ${status} (noteId=${noteId})`);
    return;
  }

  await prisma.note.update({
    where: { id: noteId },
    data: { status: 'signed' },
  });

  // 상태 이력 기록
  await prisma.noteStatusHistory.create({
    data: {
      id: uuidv4(),
      noteId,
      fromStatus: note.status as any,
      toStatus: 'signed' as any,
      changedBy: userId || 'system',
      isAdminAction: false,
    },
  }).catch((err) => {
    console.error('[event-consumer] 상태 이력 기록 실패 (상태 변경은 완료):', err);
  });

  console.log(`[event-consumer] NOTE_SIGNED 처리 완료: noteId=${noteId}`);
}

/** 메시지 처리 디스패처 */
async function processMessage(messageId: string, fields: string[]): Promise<boolean> {
  const data = parseFields(fields);
  const type = data.type;

  try {
    switch (type) {
      case 'NOTE_SIGNED':
        await handleNoteSigned(data);
        break;
      default:
        // 알 수 없는 이벤트는 무시하고 ACK (다른 서비스용일 수 있음)
        break;
    }
    return true;
  } catch (err) {
    console.error(`[event-consumer] 메시지 처리 실패 (${messageId}):`, err);
    return false;
  }
}

/** 메인 소비 루프 */
async function consumeLoop(): Promise<void> {
  while (running && redis) {
    try {
      // '>' = 아직 이 Consumer Group에 전달되지 않은 새 메시지만 읽기
      const results = await redis.xreadgroup(
        'GROUP', GROUP_NAME, CONSUMER_NAME,
        'COUNT', BATCH_SIZE,
        'BLOCK', BLOCK_MS,
        'STREAMS', EVENT_STREAM, '>',
      ) as any;

      if (!results) continue; // 타임아웃 (메시지 없음)

      for (const [_stream, messages] of results) {
        for (const [msgId, fields] of messages) {
          const ok = await processMessage(msgId, fields);
          if (ok) {
            await redis.xack(EVENT_STREAM, GROUP_NAME, msgId);
          }
          // 실패 시 ACK하지 않음 → pending에 남아서 claimLoop에서 재시도
        }
      }
    } catch (err: any) {
      if (!running) break;
      console.error('[event-consumer] 소비 루프 오류:', err.message);
      // 짧은 대기 후 재시도 (Redis 일시 장애 대비)
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Pending 메시지 복구 루프 (orphan 메시지 재처리) */
async function claimLoop(): Promise<void> {
  while (running && redis) {
    await new Promise((r) => setTimeout(r, CLAIM_INTERVAL_MS));
    if (!running || !redis) break;

    try {
      // 이 Consumer Group 내 오래된 pending 메시지 조회
      const pending = await redis.xpending(
        EVENT_STREAM, GROUP_NAME,
        '-', '+', '10',
      ) as any[];

      if (!pending || pending.length === 0) continue;

      for (const entry of pending) {
        const [msgId, _consumer, idleMs, deliveryCount] = entry;
        if (idleMs < CLAIM_MIN_IDLE_MS) continue;

        // 최대 재시도 횟수 초과 → dead letter 처리 (ACK하여 제거)
        if (deliveryCount >= MAX_DELIVERY_COUNT) {
          console.error(`[event-consumer] dead letter: 메시지 ${msgId} (재시도 ${deliveryCount}회 초과)`);
          await redis.xack(EVENT_STREAM, GROUP_NAME, msgId);
          continue;
        }

        // 오래된 메시지를 이 consumer로 가져와서 재처리
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
      console.error('[event-consumer] claim 루프 오류:', err.message);
    }
  }
}

/** Consumer 시작 */
export async function startEventConsumer(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    redis.on('error', (err: Error) => {
      console.error('[event-consumer] Redis 연결 오류:', err.message);
    });
  } catch (err) {
    console.warn('[event-consumer] Redis 연결 실패 — 이벤트 소비 비활성화:', err);
    return;
  }

  // Consumer Group 생성 (이미 존재하면 무시)
  try {
    await redis.xgroup('CREATE', EVENT_STREAM, GROUP_NAME, '0', 'MKSTREAM');
    console.log(`[event-consumer] Consumer Group 생성: ${GROUP_NAME}`);
  } catch (err: any) {
    if (err.message?.includes('BUSYGROUP')) {
      // 이미 존재 — 정상
    } else {
      console.error('[event-consumer] Consumer Group 생성 실패:', err.message);
      redis.disconnect();
      redis = null;
      return;
    }
  }

  running = true;
  console.log(`[event-consumer] 시작됨 (consumer=${CONSUMER_NAME}, group=${GROUP_NAME})`);

  // 두 루프를 병렬 실행
  consumeLoop();
  claimLoop();
}

/** Consumer 종료 (Graceful Shutdown) */
export async function stopEventConsumer(): Promise<void> {
  running = false;
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
  console.log('[event-consumer] 종료됨');
}
