import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import prismaPlugin from './plugins/prisma';
import prisma from './lib/prisma';
import authRoutes from './routes/auth.routes';
import { buildFastifyErrorHandler } from '@lab/shared';

export function buildApp(logger?: boolean): FastifyInstance {
  const app = Fastify({
    logger: logger ?? process.env.NODE_ENV !== 'test',
  });

  // ── 플러그인 ─────────────────────────────────────────────
  app.register(cors, { origin: true });

  app.register(swagger, {
    openapi: {
      info: {
        title: '인증 서비스 API',
        description: '인증/조직/사용자/역할 관리',
        version: '1.0.0',
      },
      tags: [
        { name: 'auth', description: '인증/사용자 관리' },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  app.register(prismaPlugin);

  // ── 헬스체크 ──────────────────────────────────────────────
  app.get('/health', async () => {
    let dbOk = false;
    try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
      db: dbOk ? 'ok' : 'error',
    };
  });

  // ── 라우트 ──────────────────────────────────────────────
  app.register(authRoutes, { prefix: '/api/auth' });

  // ── 전역 에러 핸들러 ─────────────────────────────────────
  app.setErrorHandler(buildFastifyErrorHandler());

  return app;
}
