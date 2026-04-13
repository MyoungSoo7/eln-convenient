import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { buildFastifyErrorHandler, createLogger } from '@lab/shared';
import v1Routes from './routes/v1.routes';
import { listEnabledAliases, summarizeRouting } from './config/routing';
import { piiScannerHook } from './middlewares/pii-scanner';
import { getUsageSummary, resetUsage } from './lib/usage-tracker';

const serviceLogger = createLogger('gemma-gateway');

export function buildApp(logger?: boolean): FastifyInstance {
  const app = Fastify({
    logger: logger ?? process.env.NODE_ENV !== 'test',
    bodyLimit: 10 * 1024 * 1024, // 10MB — 멀티모달 이미지 base64 대비
  });

  app.register(cors, { origin: false });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Gemma Gateway',
        description:
          'OpenAI-compatible router for Gemma 4 research. Routes model aliases to local Ollama / vLLM / OpenAI backends.',
        version: '0.1.0',
      },
      tags: [{ name: 'v1', description: 'OpenAI-compatible endpoints' }],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  // ── Health ─────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    service: 'gemma-gateway',
    timestamp: new Date().toISOString(),
    enabledModels: listEnabledAliases(),
  }));

  // ── Routing 정보 디버그용 ────────────────────────────────
  app.get('/_routing', async () => {
    const lines = summarizeRouting().split('\n');
    return { ok: true, routing: lines };
  });

  // ── PII 스캐너 (외부 백엔드 전송 전 개인정보 감지) ────────
  app.addHook('preHandler', piiScannerHook);

  // ── 사용량 대시보드 ─────────────────────────────────────
  app.get('/_usage', async () => ({
    ok: true,
    data: getUsageSummary(),
  }));

  app.delete('/_usage', async () => {
    resetUsage();
    return { ok: true, data: null };
  });

  // ── OpenAI 호환 v1 라우트 ──────────────────────────────
  app.register(v1Routes, { prefix: '/v1' });

  // ── 전역 에러 핸들러 ────────────────────────────────────
  app.setErrorHandler(buildFastifyErrorHandler(serviceLogger));

  return app;
}
