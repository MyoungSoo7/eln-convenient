// services/file-service/src/lib/jobWorker.ts
import prisma from './prisma';
import { deleteObjectFromBucket } from './minio';

const MAX_RETRIES = 3;

// ── 타입 ────────────────────────────────────────────────────────
type JobProcessor = (jobId: string) => Promise<void>;

// ── 간단한 in-process FIFO 큐 ─────────────────────────────────
export const jobQueue: string[] = [];
let processing = false;

const processors: Record<string, JobProcessor> = {};

export function registerProcessor(type: string, fn: JobProcessor) {
  processors[type] = fn;
}

export function startWorker() {
  setInterval(tick, 2000); // 2초마다 폴링
  console.log('[jobWorker] 시작됨 (2s 폴링)');
}

async function tick() {
  if (processing) return;
  // 1. 메모리 큐 처리
  if (jobQueue.length > 0) {
    const jobId = jobQueue.shift()!;
    await runJob(jobId);
    return;
  }
  // 2. DB에서 PENDING job 재수집 (재시작 후 복구)
  try {
    const pending = await prisma.exportJob.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (pending) await runJob(pending.id);
  } catch {
    // DB 연결 실패 무시
  }
}

async function runJob(jobId: string) {
  processing = true;
  try {
    const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'PENDING') return;

    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    const processor = processors[job.type];
    if (!processor) {
      await failJob(jobId, `알 수 없는 job 타입: ${job.type}`);
      return;
    }

    await processor(jobId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[jobWorker] job ${jobId} 처리 중 예외:`, err);
    await failOrRetry(jobId, message);
  } finally {
    processing = false;
  }
}

export async function failJob(jobId: string, errorMessage: string) {
  await prisma.exportJob.update({
    where: { id: jobId },
    data: { status: 'FAILED', errorMessage, completedAt: new Date() },
  });
}

export async function failOrRetry(jobId: string, errorMessage: string) {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.retryCount < MAX_RETRIES) {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        errorMessage,
        retryCount: { increment: 1 },
      },
    });
    // 지수 백오프: 2^retryCount * 5s
    const delay = Math.pow(2, job.retryCount) * 5000;
    setTimeout(() => jobQueue.push(jobId), delay);
    console.log(`[jobWorker] job ${jobId} 재시도 예약 (${delay}ms, ${job.retryCount + 1}/${MAX_RETRIES})`);
  } else {
    await failJob(jobId, errorMessage);
    console.error(`[jobWorker] job ${jobId} 최대 재시도 초과, FAILED 확정`);
  }
}

// 만료된 export job 정리 (1시간마다)
export function startExpiryCleanup() {
  setInterval(async () => {
    try {
      const expired = await prisma.exportJob.findMany({
        where: { status: 'COMPLETED', expiresAt: { lt: new Date() } },
        include: { resultFile: true },
      });
      for (const job of expired) {
        if (job.resultFile) {
          await deleteObjectFromBucket(job.resultFile.bucket, job.resultFile.objectKey);
          await prisma.$transaction([
            prisma.file.update({
              where: { id: job.resultFile.id },
              data: { isDeleted: true, deletedAt: new Date() },
            }),
            prisma.exportJob.delete({ where: { id: job.id } }),
          ]);
        } else {
          await prisma.exportJob.delete({ where: { id: job.id } });
        }
        console.log(`[jobWorker] 만료 job 정리: ${job.id}`);
      }
    } catch (err) {
      console.error('[jobWorker] 만료 정리 실패:', err);
    }
  }, 60 * 60 * 1000); // 1시간
}

// soft-delete된 파일을 MinIO에서 실제 삭제 (6시간마다, 24시간 유예)
export function startSoftDeleteCleanup() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24시간 유예
      const softDeleted = await prisma.file.findMany({
        where: {
          isDeleted: true,
          deletedAt: { lt: cutoff },
        },
        take: 100, // 배치 크기 제한
      });

      for (const file of softDeleted) {
        try {
          await deleteObjectFromBucket(file.bucket, file.objectKey);
          await prisma.file.delete({ where: { id: file.id } });
        } catch (err) {
          console.error(`[cleanup] 파일 물리 삭제 실패 ${file.id}:`, err);
        }
      }

      if (softDeleted.length > 0) {
        console.log(`[cleanup] soft-delete 파일 ${softDeleted.length}개 물리 삭제 완료`);
      }
    } catch (err) {
      console.error('[cleanup] soft-delete 정리 실패:', err);
    }
  }, 6 * 60 * 60 * 1000); // 6시간
}
