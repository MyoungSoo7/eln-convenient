import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import prismaPlugin from './plugins/prisma';
import prisma from './lib/prisma';
import noteRoutes from './routes/note.routes';
import noteInternalRoutes from './routes/note-internal.routes';
import templateRoutes from './routes/template.routes';
import codeRoutes from './routes/code.routes';
import { buildFastifyErrorHandler, createLogger } from '@lab/shared';
import { isEventConsumerRunning } from './lib/eventConsumer';

const serviceLogger = createLogger('eln-service');

export function buildApp(logger?: boolean): FastifyInstance {
  const app = Fastify({
    logger: logger ?? process.env.NODE_ENV !== 'test',
  });

  // ── 플러그인 ─────────────────────────────────────────────
  app.register(cors, { origin: false });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'ELN 서비스 API',
        description: '연구노트/프로토콜/템플릿 코어 서비스',
        version: '1.0.0',
      },
      tags: [
        { name: 'notes', description: '연구노트 관리' },
        { name: 'templates', description: '템플릿 관리' },
        { name: 'codes', description: '코드 관리' },
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
    const eventConsumer = isEventConsumerRunning();
    const allOk = dbOk && eventConsumer;
    return {
      status: allOk ? 'ok' : 'degraded',
      service: 'eln-service',
      timestamp: new Date().toISOString(),
      db: dbOk ? 'ok' : 'error',
      eventConsumer: eventConsumer ? 'ok' : 'stopped',
    };
  });

  // ── 라우트 ──────────────────────────────────────────────
  // 내부 전용 라우트는 note.routes의 requireAuth 훅과 분리된 scope에 먼저 등록
  // (Fastify는 먼저 등록된 정적 경로를 우선 매칭)
  app.register(noteInternalRoutes, { prefix: '/api' });
  app.register(noteRoutes, { prefix: '/api' });
  app.register(templateRoutes, { prefix: '/api/templates' });
  app.register(codeRoutes, { prefix: '/api/codes' });

  // ── 전역 에러 핸들러 ─────────────────────────────────────
  app.setErrorHandler(buildFastifyErrorHandler(serviceLogger));

  return app;
}
