import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import aiRoutes from './routes/ai.routes';
import { swaggerDocument } from './swagger';

const app = express();
const PORT = process.env.PORT || 8007;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai-assistant-service', timestamp: new Date().toISOString() });
});

app.use('/api/ai', aiRoutes);

app.listen(PORT, () => {
  console.log(`[ai-assistant-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[ai-assistant-service] Swagger: http://localhost:${PORT}/docs`);
});

export default app;
