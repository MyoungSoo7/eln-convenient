import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import prismaPlugin from './plugins/prisma';
import healthRoute from './routes/health';
import resourcesRoute from './routes/resources';
import bookingsRoute from './routes/bookings';
import { buildFastifyErrorHandler, createLogger } from '@lab/shared';

const serviceLogger = createLogger('scheduler-service');

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // ── 플러그인 ─────────────────────────────────────────────
  app.register(cors, { origin: false });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Scheduler Service API',
        description: '장비 및 회의실 예약 서비스 (ELN)',
        version: '2.0.0',
      },
      tags: [
        { name: 'health', description: '서비스 상태' },
        { name: 'resources', description: '자원 관리 (장비/회의실)' },
        { name: 'bookings', description: '예약 관리' },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  app.register(prismaPlugin);

  // ── 라우트 ──────────────────────────────────────────────
  app.register(healthRoute);
  app.register(resourcesRoute, { prefix: '/api/scheduler' });
  app.register(bookingsRoute, { prefix: '/api/scheduler' });

  // ── 전역 에러 핸들러 ─────────────────────────────────────
  app.setErrorHandler(buildFastifyErrorHandler(serviceLogger));

  return app;
}
