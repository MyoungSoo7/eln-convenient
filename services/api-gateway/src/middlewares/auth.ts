import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';
import redis from '../lib/redis';

// 공개 경로 (인증 불필요)
const PUBLIC_PATHS = ['/health', '/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/session'];

// 내부 전용 경로 (외부 접근 차단 — 서비스 간 직접 통신으로만 접근 가능)
// URL 경로에 /internal 세그먼트가 포함되면 일괄 차단 → 새 internal 엔드포인트 추가 시 수정 불필요
const INTERNAL_PATH_RE = /\/internal(\/|$)/;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. 서버를 시작할 수 없습니다.');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * JWT 검증 미들웨어 — 로컬 JWT_SECRET 검증
 *
 * 성공 시 주입 헤더:
 *   x-user-id, x-user-role, x-user-email, x-user-permissions, x-user-org-id
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

  // Redis 블랙리스트 확인
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

  // ── 로컬 JWT_SECRET 검증 ──
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
