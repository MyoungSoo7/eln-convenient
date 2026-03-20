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
