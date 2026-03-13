import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';
import Redis from 'ioredis';

// 공개 경로 (인증 불필요)
const PUBLIC_PATHS = ['/health', '/api/auth/login', '/api/auth/register'];

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-jwt-secret');

// Redis 블랙리스트 (연결 실패 시 graceful 무시)
let redis: Redis | null = null;
try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redis.on('error', () => { /* Redis 없어도 운영 가능 */ });
} catch {
  redis = null;
}

/**
 * JWT 검증 미들웨어
 * - Bearer 토큰 없으면 401
 * - 서명 검증 실패 시 401
 * - Redis 블랙리스트에 있으면 401 (로그아웃된 토큰)
 * - 성공 시 x-user-id, x-user-role 헤더 주입
 */
export async function authHook(request: FastifyRequest, reply: FastifyReply) {
  const path = request.url;

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return;

  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ ok: false, error: '인증이 필요합니다.' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Redis 블랙리스트 확인 (로그아웃된 토큰)
  if (redis) {
    try {
      const blocked = await redis.get(`blacklist:${token}`);
      if (blocked) {
        return reply.status(401).send({ ok: false, error: '만료된 세션입니다. 다시 로그인해주세요.' });
      }
    } catch {
      // Redis 오류는 무시하고 통과
    }
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    (request.headers as any)['x-user-id'] = String(payload.sub ?? '');
    (request.headers as any)['x-user-role'] = String(payload.role ?? 'viewer');
    (request.headers as any)['x-user-email'] = String(payload.email ?? '');
  } catch {
    return reply.status(401).send({ ok: false, error: '유효하지 않은 토큰입니다.' });
  }
}
