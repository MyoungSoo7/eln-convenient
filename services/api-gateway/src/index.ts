import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerProxies } from './routes/proxy';
import { registerDashboard } from './routes/dashboard';
import { authHook } from './middlewares/auth';

// ── 프로세스 레벨 에러 핸들러 ───────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[api-gateway] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[api-gateway] Uncaught Exception:', err);
  process.exit(1);
});

const app = Fastify({ logger: true });

async function bootstrap() {
  // 미들웨어
  await app.register(helmet);
  await app.register(cors, { origin: process.env.CORS_ORIGIN || '*' });
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '15 minutes',
    errorResponseBuilder: () => ({
      ok: false,
      error: '요청 횟수 제한 초과. 잠시 후 다시 시도해주세요.',
    }),
  });

  // 헬스체크
  app.get('/health', async () => ({
    ok: true,
    data: { service: 'api-gateway', timestamp: new Date().toISOString() },
  }));

  // JWT 검증 훅 (로그인/헬스체크 제외)
  app.addHook('onRequest', authHook);

  // 대시보드 집계 라우트 (프록시보다 먼저 등록)
  await registerDashboard(app);

  // 프록시 라우팅
  await registerProxies(app);

  // 시작
  const port = Number(process.env.PORT) || 8000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[api-gateway] 서버가 포트 ${port}에서 실행 중입니다.`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

export default app;
