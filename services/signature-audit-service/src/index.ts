import '@lab/shared/dist/tracing';
import { buildApp } from './app';
import { setupProcessHandlers, createLogger } from '@lab/shared';
import './workers/export.worker'; // BullMQ 워커 자동 시작
import './workers/notification.worker'; // 알림 워커 (NOTE_SIGNED 등 at-least-once)
import { startAuditConsumer, stopAuditConsumer } from './workers/auditConsumer';

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

    // Audit Stream Consumer 시작 (Redis 연결 실패해도 서비스는 계속)
    startAuditConsumer().catch((err) => {
      logger.error({ err }, '[audit-consumer] 시작 실패');
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, '종료 시작');
      await stopAuditConsumer().catch(() => {});
      await app.close().catch(() => {});
      process.exit(0);
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
