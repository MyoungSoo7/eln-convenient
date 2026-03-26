import '@lab/shared/dist/tracing';
import { buildApp } from './app';
import { setupProcessHandlers, createLogger } from '@lab/shared';
import './workers/export.worker'; // BullMQ 워커 자동 시작

const logger = createLogger('signature-audit-service');

setupProcessHandlers('signature-audit-service', logger);

const PORT = Number(process.env.PORT) || 8003;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT }, '서버 시작');
    logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
