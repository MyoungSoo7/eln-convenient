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
  format: 'pdf' | 'zip';
  noteIds?: string[]; // zip 일 때 복수 노트
  requestedBy: string;
}
