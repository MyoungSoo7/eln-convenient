/**
 * Fastify 공통 인증/권한 미들웨어
 *
 * NOTE: fastify 타입이 없는 환경에서도 빌드되도록 제네릭 타입 사용.
 * 각 서비스에서 FastifyRequest/FastifyReply로 캐스팅하여 사용.
 */
import type { PermissionValue } from './permissions';
import { ErrorCode } from './error-codes';

export interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
}
export interface MinimalReply {
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
    return;
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
      return;
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
        code: ErrorCode.AUTH_PERMISSION_DENIED,
      });
      return;
    }
  };
}

/**
 * 소유자 또는 admin만 접근 허용하는 미들웨어 팩토리.
 *
 * @param findResource  요청으로부터 리소스를 조회하는 함수 (null이면 404)
 * @param ownerField    리소스 내 소유자 ID가 담긴 필드명
 * @param errorCode     403 시 사용할 에러 코드 (기본: FORBIDDEN)
 */
export function requireOwnerOrAdminFastify<T extends Record<string, unknown>>(
  findResource: (request: MinimalRequest) => Promise<T | null>,
  ownerField: keyof T & string,
  errorCode: string = ErrorCode.FORBIDDEN,
) {
  return async function ownerOrAdminGuard(
    request: MinimalRequest & { routeResource?: T },
    reply: MinimalReply,
  ): Promise<void> {
    const resource = await findResource(request);
    if (!resource) {
      reply.code(404).send({ ok: false, error: '리소스를 찾을 수 없습니다.', code: ErrorCode.NOT_FOUND });
      return;
    }

    const userId = request.headers['x-user-id'] as string;
    const userRole = request.headers['x-user-role'] as string;

    if (resource[ownerField] !== userId && userRole !== 'admin') {
      reply.code(403).send({ ok: false, error: '권한이 없습니다.', code: errorCode });
      return;
    }

    // 조회된 리소스를 request에 저장하여 핸들러에서 재사용
    (request as any).routeResource = resource;
  };
}

/**
 * 내부 서비스 간 호출 전용 — x-internal-secret 헤더 검증.
 *
 * 무중단 시크릿 회전을 위한 dual-secret 지원:
 *   INTERNAL_SECRET           = 신규 시크릿 (필수)
 *   INTERNAL_SECRET_PREVIOUS  = 직전 시크릿 (선택, 회전 진행 중에만 설정)
 *
 * 회전 절차:
 *   1) 모든 서비스에 INTERNAL_SECRET_PREVIOUS=<현재값>, INTERNAL_SECRET=<신규> 동시 배포
 *   2) 일정 시간 경과(전 서비스가 신규 값으로 호출 전환됨) 후 INTERNAL_SECRET_PREVIOUS 제거
 */
export async function requireInternalSecretFastify(
  request: MinimalRequest,
  reply: MinimalReply,
): Promise<void> {
  const expected = process.env.INTERNAL_SECRET;
  const expectedPrev = process.env.INTERNAL_SECRET_PREVIOUS;
  if (!expected) {
    reply.code(404).send({ ok: false, error: 'Not Found', code: ErrorCode.NOT_FOUND });
    return;
  }
  const provided = request.headers['x-internal-secret'];
  const ok = provided === expected || (expectedPrev != null && expectedPrev !== '' && provided === expectedPrev);
  if (!ok) {
    reply.code(401).send({ ok: false, error: '내부 요청 인증 실패', code: ErrorCode.INTERNAL_AUTH_FAILED });
    return;
  }
}
