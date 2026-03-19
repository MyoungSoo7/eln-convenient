import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth.routes';
import { swaggerDocument } from './swagger';
import prisma from './lib/prisma';
import { globalErrorHandler, setupProcessHandlers, createHttpLogger } from '@lab/shared';

const { logger, httpLogger } = createHttpLogger('auth-service');

setupProcessHandlers('auth-service', logger, {
  onShutdown: () => prisma.$disconnect(),
});

const app = express();
const PORT = process.env.PORT || 8001;

app.use(cors());
app.use(express.json());
app.use(httpLogger);

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 헬스체크
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'error',
  });
});

// 라우트
app.use('/api/auth', authRoutes);

app.use(globalErrorHandler('auth-service', logger));

app.listen(PORT, () => {
  logger.info({ port: PORT }, '서버 시작');
  logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
});

export default app;
