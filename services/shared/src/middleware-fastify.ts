/**
 * Fastify 공통 인증/권한 미들웨어
 * Fastify 기반 서비스(scheduler-service 등)에서 import하여 사용
 *
 * NOTE: fastify 타입이 없는 환경에서도 빌드되도록 제네릭 타입 사용.
 * 각 서비스에서 FastifyRequest/FastifyReply로 캐스팅하여 사용.
 */
import type { PermissionValue } from './permissions';

interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
}
interface MinimalReply {
  code(statusCode: number): MinimalReply;
  send(payload?: unknown): MinimalReply;
}

/** 인증 필수 — x-user-id 헤더가 없으면 401 */
export async function requireAuthFastify(
  request: MinimalRequest,
  reply: MinimalReply,
): Promise<void> {
  if (!request.headers['x-user-id']) {
    reply.code(401).send({ ok: false, error: '인증이 필요합니다.' });
  }
}

/** 역할 기반 접근 제어 */
export function requireRoleFastify(...roles: string[]) {
  return async function roleGuard(
    request: MinimalRequest,
    reply: MinimalReply,
  ): Promise<void> {
    const role = request.headers['x-user-role'] as string | undefined;
    if (!role || !roles.includes(role)) {
      reply.code(403).send({
        ok: false,
        error: `권한 부족: ${roles.join(' 또는 ')} 역할이 필요합니다.`,
      });
    }
  };
}

/** 퍼미션 기반 접근 제어 — Permission.* 상수만 허용 (타입 안전) */
export function requirePermissionFastify(permission: PermissionValue) {
  return async function permissionGuard(
    request: MinimalRequest,
    reply: MinimalReply,
  ): Promise<void> {
    const raw = request.headers['x-user-permissions'] as string | undefined;
    let permissions: string[] = [];
    try {
      permissions = raw ? JSON.parse(raw) : [];
    } catch {
      reply.code(400).send({ ok: false, error: '잘못된 권한 헤더 형식입니다.' });
      return;
    }
    if (!permissions.includes('*') && !permissions.includes(permission)) {
      reply.code(403).send({
        ok: false,
        error: `권한 부족: '${permission}' 권한이 필요합니다.`,
      });
    }
  };
}
