import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import prismaPlugin from './plugins/prisma';
import healthRoute from './routes/health';
import modelsRoute from './routes/models';
import promptsRoute from './routes/prompts';
import datasetsRoute from './routes/datasets';
import experimentsRoute from './routes/experiments';
import { buildFastifyErrorHandler, createLogger } from '@lab/shared';

const serviceLogger = createLogger('model-registry-service');

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.register(cors, { origin: false });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Model Registry Service API',
        description: 'Gemma 4 연구 플랫폼 — 모델/프롬프트/평가셋/실험 관리',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: '서비스 상태' },
        { name: 'models', description: '모델 레지스트리' },
        { name: 'prompts', description: '프롬프트 템플릿' },
        { name: 'datasets', description: '평가셋' },
        { name: 'experiments', description: '실험 기록' },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  app.register(prismaPlugin);

  app.register(healthRoute);
  app.register(modelsRoute, { prefix: '/api/registry' });
  app.register(promptsRoute, { prefix: '/api/registry' });
  app.register(datasetsRoute, { prefix: '/api/registry' });
  app.register(experimentsRoute, { prefix: '/api/registry' });

  app.setErrorHandler(buildFastifyErrorHandler(serviceLogger));

  return app;
}
