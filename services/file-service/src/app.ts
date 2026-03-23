import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import prismaPlugin from './plugins/prisma';
import prisma from './lib/prisma';
import fileRoutes from './routes/file.routes';
import exportRoutes from './routes/export.routes';
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
        title: '파일 서비스 API',
        description: '파일 업로드/다운로드 서비스 (MinIO 인터페이스)',
        version: '1.0.0',
      },
      tags: [
        { name: 'files', description: '파일 관리' },
        { name: 'exports', description: '내보내기 관리' },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB default
  });

  app.register(prismaPlugin);

  // ── 헬스체크 ──────────────────────────────────────────────
  app.get('/health', async (_request, reply) => {
    let dbOk = false;
    let minioOk = false;
    try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
    try {
      const { s3, BUCKET } = await import('./lib/minio');
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
      minioOk = true;
    } catch {}
    const healthy = dbOk && minioOk;
    if (!healthy) reply.code(503);
    return {
      status: healthy ? 'ok' : 'degraded',
      service: 'file-service',
      timestamp: new Date().toISOString(),
      db: dbOk ? 'ok' : 'error',
      minio: minioOk ? 'ok' : 'error',
    };
  });

  // ── 라우트 ──────────────────────────────────────────────
  app.register(fileRoutes, { prefix: '/api/files' });
  app.register(exportRoutes, { prefix: '/api/exports' });

  // ── 전역 에러 핸들러 ─────────────────────────────────────
  app.setErrorHandler(buildFastifyErrorHandler());

  return app;
}
