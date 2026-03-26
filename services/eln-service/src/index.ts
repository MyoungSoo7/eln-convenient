import '@lab/shared/dist/tracing';
import { buildApp } from './app';
import { setupProcessHandlers, createLogger } from '@lab/shared';
import { startEventConsumer, stopEventConsumer } from './lib/eventConsumer';
import prisma from './lib/prisma';

const logger = createLogger('eln-service');

setupProcessHandlers('eln-service', logger, {
  onShutdown: async () => {
    await stopEventConsumer();
    await prisma.$disconnect();
  },
});

const PORT = Number(process.env.PORT) || 8002;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT }, '서버 시작');
    logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');

    // Redis Stream 이벤트 Consumer 시작 (비동기, 실패해도 서버 기동에 영향 없음)
    startEventConsumer().catch((err) => {
      logger.warn({ err }, 'Event Consumer 시작 실패 — HTTP 폴백으로 운영');
    });
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
