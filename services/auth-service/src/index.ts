import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth.routes';
import { swaggerDocument } from './swagger';

const app = express();
const PORT = process.env.PORT || 8001;

app.use(cors());
app.use(express.json());

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 헬스체크
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

// 라우트
app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`[auth-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[auth-service] Swagger: http://localhost:${PORT}/docs`);
});

export default app;
