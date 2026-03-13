import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import Redis from 'ioredis';

// 공개 경로 (인증 불필요)
const PUBLIC_PATHS = ['/health', '/api/auth/login', '/api/auth/register'];

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-jwt-secret');

// Keycloak SSO 설정 (KEYCLOAK_ENABLED=true 시 활성화)
const KEYCLOAK_ENABLED = process.env.KEYCLOAK_ENABLED === 'true';
const KEYCLOAK_JWKS_URI = process.env.KEYCLOAK_JWKS_URI || '';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || '';

// Keycloak JWKS (런타임 초기화 — 연결 실패해도 서버 기동)
let keycloakJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
if (KEYCLOAK_ENABLED && KEYCLOAK_JWKS_URI) {
  try {
    keycloakJWKS = createRemoteJWKSet(new URL(KEYCLOAK_JWKS_URI));
  } catch {
    console.warn('[auth] Keycloak JWKS 초기화 실패 — 로컬 JWT 모드로 운영');
  }
}

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
 * Keycloak 토큰에서 role 추출
 * - realm_access.roles 우선 (admin > researcher > viewer)
 */
function extractKeycloakRole(payload: JWTPayload): string {
  const realmRoles: string[] = (payload as any)?.realm_access?.roles ?? [];
  const clientRoles: string[] = (payload as any)?.resource_access?.['labnote-frontend']?.roles ?? [];
  const allRoles = [...realmRoles, ...clientRoles];

  if (allRoles.includes('admin')) return 'admin';
  if (allRoles.includes('researcher')) return 'researcher';
  return 'viewer';
}

/**
 * JWT 검증 미들웨어 — 듀얼 모드
 *
 * 모드 1 (기본): 로컬 JWT_SECRET 검증 (auth-service 발급 토큰)
 * 모드 2 (KEYCLOAK_ENABLED=true): Keycloak JWKS 검증 → 실패 시 로컬 JWT 폴백
 *
 * 성공 시 주입 헤더:
 *   x-user-id, x-user-role, x-user-email, x-user-permissions, x-sso-provider
 */
export async function authHook(request: FastifyRequest, reply: FastifyReply) {
  const path = request.url;

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return;

  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ ok: false, error: '인증이 필요합니다.' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Redis 블랙리스트 확인 (로컬 JWT 전용)
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

  // ── 모드 2: Keycloak JWKS 검증 ──
  if (KEYCLOAK_ENABLED && keycloakJWKS) {
    try {
      const { payload } = await jwtVerify(token, keycloakJWKS, {
        issuer: KEYCLOAK_ISSUER || undefined,
      });
      const role = extractKeycloakRole(payload);
      (request.headers as any)['x-user-id'] = String(payload.sub ?? '');
      (request.headers as any)['x-user-role'] = role;
      (request.headers as any)['x-user-email'] = String((payload as any).email ?? '');
      (request.headers as any)['x-user-permissions'] = JSON.stringify([]);
      (request.headers as any)['x-sso-provider'] = 'keycloak';
      return;
    } catch {
      // Keycloak 검증 실패 → 로컬 JWT 폴백
    }
  }

  // ── 모드 1: 로컬 JWT_SECRET 검증 ──
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    (request.headers as any)['x-user-id'] = String(payload.sub ?? '');
    (request.headers as any)['x-user-role'] = String((payload as any).role ?? 'viewer');
    (request.headers as any)['x-user-email'] = String((payload as any).email ?? '');
    (request.headers as any)['x-user-permissions'] = JSON.stringify(
      Array.isArray((payload as any).permissions) ? (payload as any).permissions : []
    );
    (request.headers as any)['x-sso-provider'] = 'local';
  } catch {
    return reply.status(401).send({ ok: false, error: '유효하지 않은 토큰입니다.' });
  }
}
