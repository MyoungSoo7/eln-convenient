import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import signatureRoutes from './routes/signature.routes';
import auditRoutes from './routes/audit.routes';
import exportRoutes from './routes/export.routes';
import { swaggerDocument } from './swagger';
import './workers/export.worker'; // BullMQ 워커 자동 시작
import { globalErrorHandler, setupProcessHandlers } from '@lab/shared';

setupProcessHandlers('signature-audit-service');

const app = express();
const PORT = process.env.PORT || 8003;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'signature-audit-service', timestamp: new Date().toISOString() });
});

// audit/export를 먼저 등록 — /api/audit/internal 등 인증 없는 내부 라우트가
// signatureRoutes의 requireAuth에 의해 차단되지 않도록 순서 보장
app.use('/api/audit', auditRoutes);
app.use('/api/export', exportRoutes);
app.use('/api', signatureRoutes);

app.use(globalErrorHandler('signature-audit-service'));

app.listen(PORT, () => {
  console.log(`[signature-audit-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[signature-audit-service] Swagger: http://localhost:${PORT}/docs`);
});

export default app;
