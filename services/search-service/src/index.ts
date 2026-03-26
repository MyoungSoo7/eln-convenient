import '@lab/shared/dist/tracing';
import { buildApp } from './app';
import { setupProcessHandlers, createLogger } from '@lab/shared';
import { ensureIndices } from './lib/opensearch';
import prisma from './lib/prisma';

const logger = createLogger('search-service');

setupProcessHandlers('search-service', logger);

const PORT = Number(process.env.PORT) || 8006;
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

  try {
    await prisma.$connect();
    logger.info('PostgreSQL 연결 완료');
  } catch (err) {
    logger.fatal({ err }, 'PostgreSQL 연결 실패 — 서비스를 종료합니다');
    process.exit(1);
  }
  try {
    await ensureIndices();
    logger.info('OpenSearch 인덱스 준비 완료');
  } catch (err) {
    logger.error({ err }, 'OpenSearch 인덱스 초기화 실패');
  }
}

main();
