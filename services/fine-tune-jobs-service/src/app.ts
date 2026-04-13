import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import prismaPlugin from './plugins/prisma';
import jobsRoute from './routes/jobs';
import { buildFastifyErrorHandler, createLogger } from '@lab/shared';

const serviceLogger = createLogger('fine-tune-jobs-service');

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.register(cors, { origin: false });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Fine-Tune Jobs Service API',
        description: 'LoRA/QLoRA 파인튜닝 잡 큐잉 및 상태 관리',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: '서비스 상태' },
        { name: 'jobs', description: '파인튜닝 잡 관리' },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  app.register(prismaPlugin);

  // Health
  app.get('/health', { schema: { tags: ['health'] } }, async () => ({
    status: 'ok',
    service: 'fine-tune-jobs-service',
    timestamp: new Date().toISOString(),
  }));

  app.register(jobsRoute, { prefix: '/api/finetune' });

  app.setErrorHandler(buildFastifyErrorHandler(serviceLogger));

  return app;
}
