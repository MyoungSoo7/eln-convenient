import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import prismaPlugin from './plugins/prisma';
import prisma from './lib/prisma';
import signatureRoutes from './routes/signature.routes';
import auditRoutes from './routes/audit.routes';
import exportRoutes from './routes/export.routes';
import notificationRoutes from './routes/notification.routes';
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
        title: '전자서명/감사로그 서비스 API',
        description: '전자서명, 감사로그, 내보내기, 알림 관리',
        version: '1.0.0',
      },
      tags: [
        { name: 'signature', description: '전자서명' },
        { name: 'audit', description: '감사로그' },
        { name: 'export', description: '내보내기' },
        { name: 'notification', description: '알림' },
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
      service: 'signature-audit-service',
      timestamp: new Date().toISOString(),
      db: dbOk ? 'ok' : 'error',
    };
  });

  // ── 라우트 ──────────────────────────────────────────────
  app.register(auditRoutes, { prefix: '/api/audit' });
  app.register(exportRoutes, { prefix: '/api/export' });
  app.register(notificationRoutes, { prefix: '/api/notifications' });
  app.register(signatureRoutes, { prefix: '/api' });

  // ── 전역 에러 핸들러 ─────────────────────────────────────
  app.setErrorHandler(buildFastifyErrorHandler());

  return app;
}
