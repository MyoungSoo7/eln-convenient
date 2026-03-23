import './tracing';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { registerProxies } from './routes/proxy';
import { registerDashboard } from './routes/dashboard';
import { registerSSE } from './routes/sse';
import { registerSession } from './routes/session';
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
  // 글로벌 에러 핸들러 — { ok, error } 통일 포맷
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    app.log.error(error);
    reply.code(statusCode).send({
      ok: false,
      error: statusCode === 500 ? '서버 내부 오류가 발생했습니다.' : error.message,
    });
  });

  // 미들웨어
  await app.register(helmet);
  // CORS — credentials: true 시 origin '*' 불가, 명시적 origin 필요
  // CORS_ORIGIN: 쉼표 구분 다중 origin 지원 (예: "https://app.example.com,https://admin.example.com")
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, cb) => {
      // origin이 없는 경우 (서버간 호출, curl 등) 허용
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('CORS 정책에 의해 차단되었습니다.'), false);
      }
    },
    credentials: true,
  });
  // Redis 기반 분산 Rate Limiting (인스턴스 간 공유)
  let rateLimitRedis: Redis | undefined;
  try {
    rateLimitRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true, maxRetriesPerRequest: 1,
    });
    rateLimitRedis.on('error', () => {});
  } catch { rateLimitRedis = undefined; }

  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    redis: rateLimitRedis,
    keyGenerator: (request) => {
      // 인증된 사용자는 userId 기준, 미인증은 IP 기준
      return (request.headers as any)['x-user-id'] || request.ip;
    },
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

  // 세션 관리 라우트 (httpOnly 쿠키 기반 refresh token)
  await registerSession(app);

  // 대시보드 집계 라우트 (프록시보다 먼저 등록)
  await registerDashboard(app);

  // SSE 이벤트 스트림 (프록시보다 먼저 등록)
  await registerSSE(app);

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
