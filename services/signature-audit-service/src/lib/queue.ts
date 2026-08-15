import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const redisConnection: any = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // BullMQ 필수 설정
  enableReadyCheck: false,
});

redisConnection.on('error', (err: any) => {
  console.error('[signature-audit-service] Redis 연결 오류:', err.message);
});

export const exportQueue = new Queue('labnote-export', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100, // 완료 잡 최대 100개 보관
    removeOnFail: 50,
  },
});

export interface ExportJobPayload {
  jobId: string;    // ExportJob.id (DB PK)
  noteId: string;
  format: 'pdf' | 'zip' | 'report';
  noteIds?: string[]; // zip / report 일 때 복수 노트
  requestedBy: string;
  orgId: string;    // 워커→ELN 호출 시 x-user-org-id 헤더용
}

// ── 알림 큐 (at-least-once 보장) ──

/**
 * 알림 발송 큐.
 * 서명 완료 같은 중요 알림은 DB 쓰기 + Redis pub/sub을 워커로 넘겨
 * 일시적 장애 시 자동 재시도(3회, 지수 백오프)로 유실 방지.
 */
export const notificationQueue = new Queue('labnote-notification', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }, // 2s → 4s → 8s
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

export interface NotificationJobPayload {
  recipientId: string;
  orgId: string;
  type: 'NOTE_LOCKED' | 'NOTE_SIGNED' | 'NOTE_UNLOCKED' | 'BOOKING_APPROVED';
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  actorId: string;
  actorName?: string;
  idempotencyKey?: string; // 중복 INSERT 방지용
}

// ── 이벤트 버스 (Redis Streams) ──

/** 이벤트 스트림 이름 */
export const EVENT_STREAM = 'labnote:events';

/** 이벤트 타입 */
export type EventType = 'NOTE_SIGNED';

/**
 * Redis Stream에 이벤트 발행
 * MAXLEN ~1000 으로 스트림 크기 제한
 */
export async function publishEvent(
  type: EventType,
  payload: Record<string, string>,
): Promise<string | null> {
  try {
    const id = await redisConnection.xadd(
      EVENT_STREAM,
      'MAXLEN', '~', '1000',
      '*',
      'type', type,
      ...Object.entries(payload).flat(),
    );
    return id;
  } catch (err: any) {
    console.error(`[event-bus] 이벤트 발행 실패 (${type}):`, err.message);
    return null;
  }
}
