import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import searchRoutes from './routes/search.routes';
import { swaggerDocument } from './swagger';
import { ensureIndices } from './lib/opensearch';
import prisma from './lib/prisma';
import { globalErrorHandler, setupProcessHandlers, createHttpLogger } from '@lab/shared';

const { logger, httpLogger } = createHttpLogger('search-service');

setupProcessHandlers('search-service', logger, {
  onShutdown: () => prisma.$disconnect(),
});

const app = express();
const PORT = process.env.PORT || 8006;

app.use(cors());
app.use(express.json());
app.use(httpLogger);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'search-service',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'error',
  });
});

app.use('/api/search', searchRoutes);

app.use(globalErrorHandler('search-service', logger));

app.listen(PORT, async () => {
  logger.info({ port: PORT }, '서버 시작');
  logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
  try {
    await prisma.$connect();
    logger.info('PostgreSQL 연결 완료');
  } catch (err) {
    logger.error({ err }, 'PostgreSQL 연결 실패');
  }
  try {
    await ensureIndices();
    logger.info('OpenSearch 인덱스 준비 완료');
  } catch (err) {
    logger.error({ err }, 'OpenSearch 인덱스 초기화 실패');
  }
});

export default app;
