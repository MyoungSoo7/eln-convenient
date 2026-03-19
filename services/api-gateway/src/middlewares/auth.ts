import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import redis from '../lib/redis';

// 공개 경로 (인증 불필요)
const PUBLIC_PATHS = ['/health', '/api/auth/login', '/api/auth/register', '/api/auth/sso-hook'];

// 내부 전용 경로 (외부 접근 차단 — 서비스 간 직접 통신으로만 접근 가능)
const INTERNAL_PATHS = ['/api/auth/internal'];

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. 서버를 시작할 수 없습니다.');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

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

// auth-service URL (내부 역할→권한 조회용)
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

/**
 * auth-service에서 역할별 권한 목록 조회 (Keycloak SSO 사용자용)
 * Redis 캐시 적용: 1시간 TTL (role-perms:{role})
 * 조회 실패 시 빈 배열 반환 (graceful)
 */
async function fetchRolePermissions(role: string): Promise<string[]> {
  const cacheKey = `role-perms:${role}`;

  // Redis 캐시 확인
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* Redis 오류는 무시 */ }
  }

  try {
    const res = await fetch(
      `${AUTH_SERVICE_URL}/api/auth/internal/role-permissions?role=${encodeURIComponent(role)}`,
      { headers: { 'x-internal-secret': INTERNAL_SECRET } },
    );
    if (!res.ok) return [];
    const body = await res.json() as { ok: boolean; permissions?: string[] };
    const permissions = body.permissions ?? [];

    // Redis에 캐싱 (1시간 TTL)
    if (redis && permissions.length > 0) {
      try { await redis.set(cacheKey, JSON.stringify(permissions), 'EX', 3600); } catch { /* 무시 */ }
    }

    return permissions;
  } catch {
    return [];
  }
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
  if (allRoles.includes('reviewer')) return 'reviewer';
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

  // 내부 전용 경로 차단 (서비스 간 직접 통신으로만 접근 가능)
  if (INTERNAL_PATHS.some((p) => path.startsWith(p))) {
    return reply.status(404).send({ ok: false, error: 'Not Found' });
  }

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
      const permissions = await fetchRolePermissions(role);
      (request.headers as any)['x-user-id'] = String(payload.sub ?? '');
      (request.headers as any)['x-user-role'] = role;
      (request.headers as any)['x-user-email'] = String((payload as any).email ?? '');
      (request.headers as any)['x-user-permissions'] = JSON.stringify(permissions);
      (request.headers as any)['x-user-org-id'] = String((payload as any).orgId ?? '');
      (request.headers as any)['x-sso-provider'] = 'keycloak';
      return;
    } catch {
      // Keycloak 검증 실패 → 로컬 JWT 폴백
    }
  }

  // ── 모드 1: 로컬 JWT_SECRET 검증 ──
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = String(payload.sub ?? '');
    const iat = payload.iat ?? 0;

    // 사용자 단위 블랙리스트 확인 (역할 변경/비활성화 시 무효화)
    if (redis && userId) {
      try {
        const invalidatedAt = await redis.get(`blacklist:user:${userId}`);
        if (invalidatedAt && iat < Number(invalidatedAt)) {
          return reply.status(401).send({ ok: false, error: '권한이 변경되었습니다. 다시 로그인해주세요.' });
        }
      } catch {
        // Redis 오류는 무시
      }
    }

    (request.headers as any)['x-user-id'] = userId;
    (request.headers as any)['x-user-role'] = String((payload as any).role ?? 'viewer');
    (request.headers as any)['x-user-email'] = String((payload as any).email ?? '');
    (request.headers as any)['x-user-permissions'] = JSON.stringify(
      Array.isArray((payload as any).permissions) ? (payload as any).permissions : []
    );
    (request.headers as any)['x-user-org-id'] = String((payload as any).orgId ?? '');
    (request.headers as any)['x-sso-provider'] = 'local';
  } catch {
    return reply.status(401).send({ ok: false, error: '유효하지 않은 토큰입니다.' });
  }
}
