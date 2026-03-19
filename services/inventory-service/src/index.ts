import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import inventoryRoutes from './routes/inventory.routes';
import { swaggerDocument } from './swagger';
import { globalErrorHandler, setupProcessHandlers } from '@lab/shared';

setupProcessHandlers('inventory-service');

const app = express();
const PORT = process.env.PORT || 8004;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'inventory-service', timestamp: new Date().toISOString() });
});

app.use('/api/inventory', inventoryRoutes);

app.use(globalErrorHandler('inventory-service'));

app.listen(PORT, () => {
  console.log(`[inventory-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[inventory-service] Swagger: http://localhost:${PORT}/docs`);
});

export default app;
