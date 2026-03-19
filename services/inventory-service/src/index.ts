import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import inventoryRoutes from './routes/inventory.routes';
import { swaggerDocument } from './swagger';
import prisma from './lib/prisma';
import { globalErrorHandler, setupProcessHandlers, createHttpLogger } from '@lab/shared';

const { logger, httpLogger } = createHttpLogger('inventory-service');

setupProcessHandlers('inventory-service', logger, {
  onShutdown: () => prisma.$disconnect(),
});

const app = express();
const PORT = process.env.PORT || 8004;

app.use(cors());
app.use(express.json());
app.use(httpLogger);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'inventory-service',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'error',
  });
});

app.use('/api/inventory', inventoryRoutes);

app.use(globalErrorHandler('inventory-service', logger));

app.listen(PORT, () => {
  logger.info({ port: PORT }, '서버 시작');
  logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
});

export default app;
