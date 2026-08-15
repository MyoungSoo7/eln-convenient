/**
 * BullMQ 기반 파인튜닝 잡 큐
 *
 * GPU 리소스 경합 방지를 위해 concurrency=1.
 * 실제 학습은 외부 노드(AWS SageMaker / vLLM 서버)에서 실행.
 * 이 워커는 잡 상태 관리 + 외부 노드 API 호출만 담당.
 */
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createLogger } from '@lab/shared';
import prisma from './prisma';

const logger = createLogger('fine-tune-jobs:queue');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const finetuneQueue = new Queue('finetune-jobs', { connection });

export interface FinetuneJobData {
  jobId: string; // DB의 FineTuneJob.id
  baseModel: string;
  method: string;
  datasetUri: string;
  config: Record<string, unknown>;
  gpuType?: string;
  gpuCount?: number;
}

/** 큐에 파인튜닝 잡 투입 */
export async function enqueueFinetuneJob(data: FinetuneJobData): Promise<string> {
  const job = await finetuneQueue.add(`finetune-${data.method}`, data, {
    attempts: 1, // 파인튜닝은 실패 시 수동 재시도
    jobId: data.jobId, // DB ID와 동일하게 매핑
  });
  logger.info({ bullmqJobId: job.id, dbJobId: data.jobId }, 'finetune job enqueued');
  return job.id!;
}

/** 워커 시작 */
export function startFinetuneWorker(): Worker {
  const worker = new Worker<FinetuneJobData>(
    'finetune-jobs',
    async (job) => {
      const { jobId, baseModel, method, datasetUri, config } = job.data;
      logger.info({ jobId, baseModel, method }, 'finetune job started');

      // DB 상태 → preparing
      await prisma.fineTuneJob.update({
        where: { id: jobId },
        data: { status: 'preparing', startedAt: new Date(), bullmqJobId: job.id },
      });

      try {
        // Phase 1: 데이터 검증
        await job.updateProgress(10);
        logger.info({ jobId }, 'validating dataset');
        // TODO: 데이터셋 URI에서 파일 검증 (MinIO 접근)

        // Phase 2: 학습 시작
        await prisma.fineTuneJob.update({
          where: { id: jobId },
          data: { status: 'training', progress: 0.2 },
        });
        await job.updateProgress(20);

        // TODO: 실제 학습 실행 — 옵션:
        // 1) AWS SageMaker CreateTrainingJob API
        // 2) 원격 vLLM 노드에 SSH/API 호출
        // 3) 로컬 GPU에서 torchtune/axolotl 실행
        //
        // 현재는 스텁 — 학습 로직은 GPU 환경 확정 후 구현
        logger.info(
          { jobId, baseModel, method, config },
          'training stub — actual training not yet implemented',
        );

        // Phase 3: 모델 업로드 (학습 완료 후)
        await prisma.fineTuneJob.update({
          where: { id: jobId },
          data: { status: 'uploading', progress: 0.9 },
        });
        await job.updateProgress(90);

        // TODO: 학습된 LoRA weights를 MinIO에 업로드
        const outputUri = `minio://research-models/finetune/${jobId}/adapter`;

        // 완료
        await prisma.fineTuneJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            progress: 1.0,
            outputModelUri: outputUri,
            completedAt: new Date(),
          },
        });
        await job.updateProgress(100);

        logger.info({ jobId, outputUri }, 'finetune job completed');
      } catch (err) {
        await prisma.fineTuneJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            errorMsg: (err as Error).message,
            completedAt: new Date(),
          },
        });
        throw err;
      }
    },
    {
      connection,
      concurrency: 1, // GPU 배타 락
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'finetune worker: job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'finetune worker: job failed');
  });

  return worker;
}
