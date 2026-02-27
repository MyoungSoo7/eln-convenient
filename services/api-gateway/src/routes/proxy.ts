import { FastifyInstance } from 'fastify';
import httpProxy from '@fastify/http-proxy';

/**
 * 서비스별 프록시 라우팅 테이블
 * prefix → upstream 매핑
 */
const PROXY_TABLE: Record<string, string> = {
  '/api/auth':       process.env.AUTH_SERVICE_URL       || 'http://auth-service:8001',
  '/api/notes':      process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/templates':  process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/signatures': process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/audit':      process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/export':     process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/inventory':  process.env.INVENTORY_SERVICE_URL  || 'http://inventory-service:8004',
  '/api/scheduler':  process.env.SCHEDULER_SERVICE_URL  || 'http://scheduler-service:8005',
  '/api/search':     process.env.SEARCH_SERVICE_URL     || 'http://search-service:8006',
  '/api/ai':         process.env.AI_SERVICE_URL         || 'http://ai-assistant-service:8007',
  '/api/files':      process.env.FILE_SERVICE_URL       || 'http://file-service:8008',
};

export async function registerProxies(app: FastifyInstance) {
  for (const [prefix, upstream] of Object.entries(PROXY_TABLE)) {
    await app.register(httpProxy, {
      upstream,
      prefix,
      rewritePrefix: prefix,
      http2: false,
    });
  }

  app.log.info('프록시 라우팅 등록 완료: %o', Object.keys(PROXY_TABLE));
}
