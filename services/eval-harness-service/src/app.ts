import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { buildFastifyErrorHandler, createLogger } from '@lab/shared';
import evalRoutes from './routes/eval.routes';

const serviceLogger = createLogger('eval-harness-service');

export function buildApp(logger?: boolean): FastifyInstance {
  const app = Fastify({
    logger: logger ?? process.env.NODE_ENV !== 'test',
    bodyLimit: 5 * 1024 * 1024,
  });

  app.register(cors, { origin: false });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Eval Harness',
        description: 'Gemma 4 연구용 평가 실행기 — smoke / KMMLU / ELN-QA / RAG',
        version: '0.1.0',
      },
      tags: [{ name: 'eval', description: '평가 실행' }],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'eval-harness-service',
    timestamp: new Date().toISOString(),
    deps: {
      mlflow: process.env.MLFLOW_URL || 'http://mlflow:5000',
      gemmaGateway: process.env.GEMMA_GATEWAY_URL || 'http://gemma-gateway:8010',
    },
  }));

  app.register(evalRoutes, { prefix: '/eval' });

  app.setErrorHandler(buildFastifyErrorHandler(serviceLogger));
  return app;
}
