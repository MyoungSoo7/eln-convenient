import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import httpProxy from '@fastify/http-proxy';
import redis from '../lib/redis';

/**
 * 서비스별 프록시 라우팅 테이블
 * prefix → upstream 매핑
 */
const PROXY_TABLE: Record<string, string> = {
  '/api/auth':       process.env.AUTH_SERVICE_URL       || 'http://auth-service:8001',
  '/api/notes':      process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/protocols':  process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/templates':  process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/codes':      process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/signatures': process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/audit':      process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/export':     process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/notifications': process.env.SIGNATURE_SERVICE_URL || 'http://signature-audit-service:8003',
  '/api/inventory':  process.env.INVENTORY_SERVICE_URL  || 'http://inventory-service:8004',
  '/api/scheduler':  process.env.SCHEDULER_SERVICE_URL  || 'http://scheduler-service:8005',
  '/api/search':     process.env.SEARCH_SERVICE_URL     || 'http://search-service:8006',
  '/api/files':      process.env.FILE_SERVICE_URL       || 'http://file-service:8008',
  '/api/exports':    process.env.FILE_SERVICE_URL       || 'http://file-service:8008',
};

/**
 * 엔드포인트별 Rate Limit 설정 (초 단위 윈도우)
 * 설정이 없는 엔드포인트는 글로벌 기본값 적용 (200/분, index.ts에서 설정)
 */
const ENDPOINT_RATE_LIMITS: Array<{ prefix: string; max: number; windowSec: number }> = [
  { prefix: '/api/export',  max: 10,  windowSec: 60 },   // PDF 생성은 비용이 큼
  { prefix: '/api/search',  max: 60,  windowSec: 60 },   // OpenSearch 부하 제한
  { prefix: '/api/auth',    max: 20,  windowSec: 60 },   // 로그인 brute-force 방지
  { prefix: '/api/files',   max: 30,  windowSec: 60 },   // 파일 업로드 제한
];

/** 엔드포인트별 세분화 Rate Limit 훅 (Redis sliding window) */
async function endpointRateLimitHook(request: FastifyRequest, reply: FastifyReply) {
  if (!redis) return;

  const path = request.url;
  const rule = ENDPOINT_RATE_LIMITS.find((r) => path.startsWith(r.prefix));
  if (!rule) return;

  const identity = (request.headers as any)['x-user-id'] || request.ip;
  const redisKey = `rl:${rule.prefix}:${identity}`;

  try {
    const current = await redis.incr(redisKey);
    if (current === 1) await redis.expire(redisKey, rule.windowSec);
    if (current > rule.max) {
      return reply.status(429).send({
        ok: false,
        error: `${rule.prefix} 요청 횟수 제한 초과 (${rule.max}회/${rule.windowSec}초). 잠시 후 다시 시도해주세요.`,
      });
    }
  } catch { /* Redis 오류 무시 — rate limit 비활성화 */ }
}

export async function registerProxies(app: FastifyInstance) {
  // 엔드포인트별 rate limit 훅 등록
  app.addHook('onRequest', endpointRateLimitHook);

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
