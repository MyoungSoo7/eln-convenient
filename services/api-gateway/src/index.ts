import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { setupProxy } from './proxy';
import { authMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 8000;

// 미들웨어
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 1000,
  message: { error: '요청 횟수 제한 초과. 잠시 후 다시 시도해주세요.' },
});
app.use(limiter);

// 헬스체크
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

// JWT 검증 미들웨어 (로그인/헬스체크 제외)
app.use('/api', authMiddleware);

// 프록시 라우팅
setupProxy(app);

// 404 처리
app.use((_req, res) => {
  res.status(404).json({ error: '요청한 경로를 찾을 수 없습니다.' });
});

app.listen(PORT, () => {
  console.log(`[api-gateway] 서버가 포트 ${PORT}에서 실행 중입니다.`);
});

export default app;
