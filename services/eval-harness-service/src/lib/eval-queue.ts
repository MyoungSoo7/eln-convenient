/**
 * BullMQ 기반 평가 큐
 *
 * 대규모 벤치마크(KMMLU 수천 문항)는 동기 실행하면 타임아웃 → 큐 기반 비동기 실행.
 * eval.routes.ts에서 큐에 잡을 투입하고, 워커가 처리.
 */
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { createLogger } from '@lab/shared';
import { runSmokeEval } from '../evaluators/smoke.evaluator';

const logger = createLogger('eval-harness:queue');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const evalQueue = new Queue('eval-jobs', { connection });

export interface EvalJobData {
  evalType: 'smoke' | 'kmmlu' | 'eln-qa' | 'rag';
  model: string;
  datasetId?: string;
  config?: Record<string, unknown>;
  requestedBy?: string;
}

export interface EvalJobResult {
  evalType: string;
  model: string;
  status: 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

/** 큐에 평가 잡 투입 */
export async function enqueueEval(data: EvalJobData): Promise<string> {
  const job = await evalQueue.add(`eval-${data.evalType}`, data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  });
  logger.info({ jobId: job.id, evalType: data.evalType, model: data.model }, 'eval job enqueued');
  return job.id!;
}

/** 잡 상태 조회 */
export async function getJobStatus(jobId: string): Promise<{
  id: string;
  status: string;
  data: EvalJobData;
  result?: EvalJobResult;
  progress: number;
}> {
  const job = await Job.fromId(evalQueue, jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  const state = await job.getState();
  return {
    id: job.id!,
    status: state,
    data: job.data as EvalJobData,
    result: job.returnvalue as EvalJobResult | undefined,
    progress: job.progress as number,
  };
}

/** 워커 시작 — 서비스 기동 시 호출 */
export function startWorker(): Worker {
  const worker = new Worker<EvalJobData, EvalJobResult>(
    'eval-jobs',
    async (job) => {
      logger.info({ jobId: job.id, evalType: job.data.evalType, model: job.data.model }, 'eval job started');
      await job.updateProgress(10);

      try {
        let result: unknown;

        switch (job.data.evalType) {
          case 'smoke':
            result = await runSmokeEval(job.data.model);
            break;
          case 'kmmlu':
          case 'eln-qa':
          case 'rag':
            // 향후 evaluator 추가 시 여기에 분기
            result = { message: `${job.data.evalType} evaluator 준비 중`, model: job.data.model };
            break;
          default:
            throw new Error(`Unknown eval type: ${job.data.evalType}`);
        }

        await job.updateProgress(100);
        return {
          evalType: job.data.evalType,
          model: job.data.model,
          status: 'completed',
          result,
        };
      } catch (err) {
        logger.error({ jobId: job.id, err: (err as Error).message }, 'eval job failed');
        return {
          evalType: job.data.evalType,
          model: job.data.model,
          status: 'failed',
          error: (err as Error).message,
        };
      }
    },
    {
      connection,
      concurrency: 1, // GPU 리소스 경합 방지 — 동시 1개
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'eval job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'eval job failed');
  });

  return worker;
}
