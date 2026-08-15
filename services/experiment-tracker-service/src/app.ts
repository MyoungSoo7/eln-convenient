import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { buildFastifyErrorHandler, createLogger } from '@lab/shared';
import experimentsRoute from './routes/experiments';
import runsRoute from './routes/runs';

const serviceLogger = createLogger('experiment-tracker-service');

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.register(cors, { origin: false });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Experiment Tracker Service API',
        description: 'MLflow 프록시 — 실험/Run/메트릭 조회 API',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: '서비스 상태' },
        { name: 'experiments', description: 'MLflow 실험 목록' },
        { name: 'runs', description: 'MLflow Run 조회' },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  // Health
  app.get('/health', { schema: { tags: ['health'] } }, async () => ({
    status: 'ok',
    service: 'experiment-tracker-service',
    timestamp: new Date().toISOString(),
    mlflowUrl: process.env.MLFLOW_URL || 'http://mlflow:5000',
  }));

  app.register(experimentsRoute, { prefix: '/api/tracker' });
  app.register(runsRoute, { prefix: '/api/tracker' });

  app.setErrorHandler(buildFastifyErrorHandler(serviceLogger));

  return app;
}
