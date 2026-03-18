import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * 인증 필수: x-user-id 헤더가 없으면 401
 * api-gateway가 JWT 검증 후 주입하는 헤더
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.headers['x-user-id']) {
    return reply.code(401).send({ ok: false, error: '인증이 필요합니다.' });
  }
}

/**
 * 역할 기반 접근 제어
 * preHandler에 함수 참조로 사용: requireRole('admin', 'lab_manager')
 */
export function requireRole(...roles: string[]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const role = request.headers['x-user-role'] as string | undefined;
    if (!role || !roles.includes(role)) {
      return reply.code(403).send({
        ok: false,
        error: `권한 부족: ${roles.join(' 또는 ')} 역할이 필요합니다.`,
      });
    }
  };
}

/**
 * 퍼미션 기반 접근 제어
 * x-user-permissions 헤더: JSON 배열 문자열 (e.g. '["scheduler:read","scheduler:write"]')
 */
export function requirePermission(permission: string) {
  return async function permissionGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const raw = request.headers['x-user-permissions'] as string | undefined;
    let permissions: string[] = [];
    try {
      permissions = raw ? JSON.parse(raw) : [];
    } catch {
      return reply.code(400).send({ ok: false, error: '잘못된 권한 헤더 형식입니다.' });
    }
    if (!permissions.includes('*') && !permissions.includes(permission)) {
      return reply.code(403).send({
        ok: false,
        error: `권한 부족: '${permission}' 권한이 필요합니다.`,
      });
    }
  };
}
