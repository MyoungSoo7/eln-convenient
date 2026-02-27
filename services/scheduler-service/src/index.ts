import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import schedulerRoutes from './routes/scheduler.routes';
import { swaggerDocument } from './swagger';

const app = express();
const PORT = process.env.PORT || 8005;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'scheduler-service', timestamp: new Date().toISOString() });
});

app.use('/api/scheduler', schedulerRoutes);

app.listen(PORT, () => {
  console.log(`[scheduler-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[scheduler-service] Swagger: http://localhost:${PORT}/docs`);
});

export default app;
