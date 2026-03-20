import { Request } from 'express';
import { AppError } from './errors';
import { ErrorCode } from './error-codes';

/**
 * 요청 헤더에서 orgId를 추출한다.
 * API Gateway가 JWT에서 주입한 x-user-org-id 헤더를 사용.
 * 값이 없으면 AppError(403)을 throw한다.
 */
export function getOrgId(req: Request): string {
  const orgId = req.headers['x-user-org-id'] as string | undefined;
  if (!orgId) {
    throw new AppError(403, '조직 정보가 없습니다.', ErrorCode.FORBIDDEN);
  }
  return orgId;
}

/**
 * Prisma where 절에 orgId 조건을 자동 주입한다.
 *
 * @example
 * const notes = await prisma.note.findMany({
 *   where: withOrgScope({ status: 'draft' }, orgId),
 * });
 * // → { status: 'draft', orgId: '...' }
 */
export function withOrgScope<T extends Record<string, unknown>>(
  where: T,
  orgId: string,
): T & { orgId: string } {
  return { ...where, orgId };
}
