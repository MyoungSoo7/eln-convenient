import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import signatureRoutes from './routes/signature.routes';
import auditRoutes from './routes/audit.routes';
import exportRoutes from './routes/export.routes';
import notificationRoutes from './routes/notification.routes';
import { swaggerDocument } from './swagger';
import './workers/export.worker'; // BullMQ 워커 자동 시작
import prisma from './lib/prisma';
import { globalErrorHandler, setupProcessHandlers, createHttpLogger } from '@lab/shared';

const { logger, httpLogger } = createHttpLogger('signature-audit-service');

setupProcessHandlers('signature-audit-service', logger, {
  onShutdown: () => prisma.$disconnect(),
});

const app = express();
const PORT = process.env.PORT || 8003;

app.use(cors());
app.use(express.json());
app.use(httpLogger);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'signature-audit-service',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'error',
  });
});

// audit/export를 먼저 등록 — /api/audit/internal 등 인증 없는 내부 라우트가
// signatureRoutes의 requireAuth에 의해 차단되지 않도록 순서 보장
app.use('/api/audit', auditRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', signatureRoutes);

app.use(globalErrorHandler('signature-audit-service', logger));

app.listen(PORT, () => {
  logger.info({ port: PORT }, '서버 시작');
  logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
});

export default app;
