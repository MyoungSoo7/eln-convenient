import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import fileRoutes from './routes/file.routes';
import exportRoutes from './routes/export.routes';
import { swaggerDocument } from './swagger';
import { ensureBucket } from './lib/minio';

const app = express();
const PORT = process.env.PORT || 8008;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'file-service', timestamp: new Date().toISOString() });
});

app.use('/api/files', fileRoutes);
app.use('/api/exports', exportRoutes);

app.listen(PORT, async () => {
  console.log(`[file-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[file-service] Swagger: http://localhost:${PORT}/docs`);
  try {
    await ensureBucket();
    console.log('[file-service] MinIO 버킷 준비 완료');
  } catch (err) {
    console.error('[file-service] MinIO 버킷 초기화 실패 (나중에 재시도):', err);
  }
});

export default app;
