import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import redis from '../lib/redis';

// 공개 경로 (인증 불필요)
const PUBLIC_PATHS = ['/health', '/api/auth/login', '/api/auth/register', '/api/auth/sso-hook', '/api/auth/refresh', '/api/auth/session'];

// 내부 전용 경로 (외부 접근 차단 — 서비스 간 직접 통신으로만 접근 가능)
// URL 경로에 /internal 세그먼트가 포함되면 일괄 차단 → 새 internal 엔드포인트 추가 시 수정 불필요
const INTERNAL_PATH_RE = /\/internal(\/|$)/;

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

const ROLE_PERMS_TTL = 300; // 5분 — 권한 변경 반영 최대 지연
const ROLE_PERMS_STALE_TTL = 86400; // 24시간 — auth-service 장애 시 스탤 캐시 폴백용

/**
 * auth-service에서 역할별 권한 목록 조회 (Keycloak SSO 사용자용)
 * Redis 캐시: 5분 TTL + stale 캐시 24시간 (장애 폴백)
 */
async function fetchRolePermissions(role: string, orgId?: string): Promise<string[]> {
  const cacheKey = orgId ? `role-perms:${role}:${orgId}` : `role-perms:${role}`;
  const staleKey = `${cacheKey}:stale`;

  // Redis 캐시 확인 (5분 TTL)
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* Redis 오류는 무시 */ }
  }

  // auth-service에 조회
  try {
    const params = new URLSearchParams({ role });
    if (orgId) params.set('orgId', orgId);
    const res = await fetch(
      `${AUTH_SERVICE_URL}/api/auth/internal/role-permissions?${params}`,
      { headers: { 'x-internal-secret': INTERNAL_SECRET } },
    );
    if (!res.ok) throw new Error(`auth-service responded ${res.status}`);
    const body = await res.json() as { ok: boolean; permissions?: string[] };
    const permissions = body.permissions ?? [];

    // Redis에 이중 캐싱: 정규 캐시(5분) + 스탤 캐시(24시간, 장애 폴백)
    if (redis && permissions.length > 0) {
      const value = JSON.stringify(permissions);
      try {
        await redis.set(cacheKey, value, 'EX', ROLE_PERMS_TTL);
        await redis.set(staleKey, value, 'EX', ROLE_PERMS_STALE_TTL);
      } catch { /* 무시 */ }
    }

    return permissions;
  } catch {
    // auth-service 장애 시 스탤 캐시 폴백 (24시간 이내 데이터)
    if (redis) {
      try {
        const stale = await redis.get(staleKey);
        if (stale) return JSON.parse(stale);
      } catch { /* 무시 */ }
    }
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
  if (INTERNAL_PATH_RE.test(path)) {
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
      const userId = String(payload.sub ?? '');
      const iat = payload.iat ?? 0;

      // 사용자 단위 블랙리스트 확인 (역할/권한 변경 시 무효화)
      if (redis && userId) {
        try {
          const invalidatedAt = await redis.get(`blacklist:user:${userId}`);
          if (invalidatedAt && iat < Number(invalidatedAt)) {
            return reply.status(401).send({ ok: false, error: '권한이 변경되었습니다. 다시 로그인해주세요.' });
          }
        } catch { /* Redis 오류는 무시 */ }
      }

      const role = extractKeycloakRole(payload);
      const orgId = String((payload as any).org_id ?? (payload as any).orgId ?? '');
      const permissions = await fetchRolePermissions(role, orgId || undefined);
      (request.headers as any)['x-user-id'] = userId;
      (request.headers as any)['x-user-role'] = role;
      (request.headers as any)['x-user-email'] = String((payload as any).email ?? '');
      (request.headers as any)['x-user-permissions'] = JSON.stringify(permissions);
      if (!orgId) {
        return reply.status(403).send({ ok: false, error: '조직 정보가 없는 토큰입니다. 관리자에게 문의하세요.' });
      }
      (request.headers as any)['x-user-org-id'] = orgId;
      (request.headers as any)['x-sso-provider'] = 'keycloak';
      // Keycloak SSO에서는 팀 정보가 JWT에 없으므로 빈 배열 주입
      (request.headers as any)['x-user-team-ids'] = '[]';
      (request.headers as any)['x-user-team-roles'] = '{}';
      return;
    } catch (err) {
      // JWKS fetch 오류와 토큰 검증 오류를 구분하여 로깅
      const isJWKSError = err instanceof Error && (err.message.includes('fetch') || err.message.includes('JWKS'));
      if (isJWKSError) {
        console.warn('[auth] Keycloak JWKS 조회 실패 — 로컬 JWT 폴백 전환');
      }
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
    const orgId = String((payload as any).orgId ?? '');
    if (!orgId) {
      return reply.status(403).send({ ok: false, error: '조직 정보가 없는 토큰입니다. 관리자에게 문의하세요.' });
    }
    (request.headers as any)['x-user-org-id'] = orgId;
    (request.headers as any)['x-sso-provider'] = 'local';
    // 팀 정보 주입
    const teams: Array<{ id: string; role: string }> = Array.isArray((payload as any).teams) ? (payload as any).teams : [];
    (request.headers as any)['x-user-team-ids'] = JSON.stringify(teams.map(t => t.id));
    const teamRoles: Record<string, string> = {};
    teams.forEach(t => { teamRoles[t.id] = t.role; });
    (request.headers as any)['x-user-team-roles'] = JSON.stringify(teamRoles);
  } catch {
    return reply.status(401).send({ ok: false, error: '유효하지 않은 토큰입니다.' });
  }
}
