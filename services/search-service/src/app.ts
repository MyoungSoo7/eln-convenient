import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import prismaPlugin from './plugins/prisma';
import prisma from './lib/prisma';
import searchRoutes from './routes/search.routes';
import { buildFastifyErrorHandler, createLogger } from '@lab/shared';

const serviceLogger = createLogger('search-service');

export function buildApp(logger?: boolean): FastifyInstance {
  const app = Fastify({
    logger: logger ?? process.env.NODE_ENV !== 'test',
  });

  // ── 플러그인 ─────────────────────────────────────────────
  app.register(cors, { origin: false });

  app.register(swagger, {
    openapi: {
      info: {
        title: '통합검색 서비스 API',
        description: '통합검색, 색인, 즐겨찾기, 검색 히스토리',
        version: '1.0.0',
      },
      tags: [
        { name: 'search', description: '통합 검색' },
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
      service: 'search-service',
      timestamp: new Date().toISOString(),
      db: dbOk ? 'ok' : 'error',
    };
  });

  // ── 라우트 ──────────────────────────────────────────────
  app.register(searchRoutes, { prefix: '/api/search' });

  // ── 전역 에러 핸들러 ─────────────────────────────────────
  app.setErrorHandler(buildFastifyErrorHandler(serviceLogger));

  return app;
}
