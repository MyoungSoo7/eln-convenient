import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import aiRoutes from './routes/ai.routes';
import { swaggerDocument } from './swagger';
import { startIndexWorker } from './workers/index.worker';
import { ensureCollection } from './services/qdrant.service';
import { logProviderConfig } from './providers/llm';

const app = express();
const PORT = process.env.PORT || 8007;

// Provider 설정 로깅 + Qdrant 컬렉션 초기화 + BullMQ Worker 시작
logProviderConfig();
ensureCollection().catch((e: Error) => console.warn('[startup] Qdrant 초기화 실패:', e.message));
startIndexWorker();

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
