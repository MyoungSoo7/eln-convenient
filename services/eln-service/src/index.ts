import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import noteRoutes from './routes/note.routes';
import templateRoutes from './routes/template.routes';
import { swaggerDocument } from './swagger';
import prisma from './lib/prisma';
import { globalErrorHandler, setupProcessHandlers, createHttpLogger } from '@lab/shared';
import { startEventConsumer, stopEventConsumer } from './lib/eventConsumer';

const { logger, httpLogger } = createHttpLogger('eln-service');

setupProcessHandlers('eln-service', logger, {
  onShutdown: async () => {
    await stopEventConsumer();
    await prisma.$disconnect();
  },
});

const app = express();
const PORT = process.env.PORT || 8002;

app.use(cors());
app.use(express.json());
app.use(httpLogger);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'eln-service',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'error',
  });
});

app.use('/api', noteRoutes);
app.use('/api/templates', templateRoutes);

app.use(globalErrorHandler('eln-service', logger));

app.listen(PORT, () => {
  logger.info({ port: PORT }, '서버 시작');
  logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');

  // Redis Stream 이벤트 Consumer 시작 (비동기, 실패해도 서버 기동에 영향 없음)
  startEventConsumer().catch((err) => {
    logger.warn({ err }, 'Event Consumer 시작 실패 — HTTP 폴백으로 운영');
  });
});

export default app;
