import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import searchRoutes from './routes/search.routes';
import { swaggerDocument } from './swagger';
import { ensureIndices } from './lib/opensearch';

const app = express();
const PORT = process.env.PORT || 8006;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'search-service', timestamp: new Date().toISOString() });
});

app.use('/api/search', searchRoutes);

app.listen(PORT, async () => {
  console.log(`[search-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[search-service] Swagger: http://localhost:${PORT}/docs`);
  try {
    await ensureIndices();
    console.log('[search-service] OpenSearch 인덱스 준비 완료');
  } catch (err) {
    console.error('[search-service] OpenSearch 인덱스 초기화 실패:', err);
  }
});

export default app;
