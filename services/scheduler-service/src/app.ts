import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import prismaPlugin from './plugins/prisma';
import healthRoute from './routes/health';
import resourcesRoute from './routes/resources';
import bookingsRoute from './routes/bookings';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // ── 플러그인 ─────────────────────────────────────────────
  app.register(cors, { origin: true });

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

  // ── 전역 에러 핸들러 (통일된 ErrorResponse 포맷) ─────────
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Fastify 스키마 검증 실패 (400)
    if (error.validation) {
      const details = error.validation.map((v) => v.message ?? String(v));
      return reply.code(400).send({
        ok: false,
        error: '요청 데이터가 올바르지 않습니다.',
        code: 'ERR_VALIDATION',
        details,
      });
    }

    app.log.error(error);
    return reply.code(statusCode).send({
      ok: false,
      error: statusCode === 500 ? '서버 내부 오류가 발생했습니다.' : error.message,
      code: `ERR_${statusCode}`,
    });
  });

  return app;
}
