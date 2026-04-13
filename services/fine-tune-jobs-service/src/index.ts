import '@lab/shared/dist/tracing';
import { buildApp } from './app';
import { createLogger, setupProcessHandlers } from '@lab/shared';
import { startFinetuneWorker } from './lib/finetune-queue';

const logger = createLogger('fine-tune-jobs-service');

setupProcessHandlers('fine-tune-jobs-service', logger);

const PORT = Number(process.env.PORT) || 8014;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT }, 'fine-tune-jobs-service 시작');

    // BullMQ 워커 시작 (파인튜닝 큐 소비)
    startFinetuneWorker();
    logger.info('finetune worker started (concurrency=1, GPU exclusive)');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
