import { buildApp } from './app';
import { createLogger, setupProcessHandlers } from '@lab/shared';
import { startWorker } from './lib/eval-queue';

const logger = createLogger('eval-harness-service');

setupProcessHandlers('eval-harness-service', logger);

const PORT = Number(process.env.PORT) || 8011;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT }, 'eval-harness-service 시작');
    logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');

    // BullMQ 워커 시작 (평가 큐 소비)
    startWorker();
    logger.info('eval worker started (concurrency=1)');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
