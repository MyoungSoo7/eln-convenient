/**
 * Express 공통 인증/권한 미들웨어
 * 모든 Express 기반 서비스에서 import하여 사용
 */
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errors';
import { ErrorCode } from './error-codes';
import type { PermissionValue } from './permissions';

/** 인증 필수 — x-user-id 헤더가 없으면 401 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.headers['x-user-id']) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  next();
}

/** 역할 기반 접근 제어 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userRole = req.headers['x-user-role'] as string;
    if (!roles.includes(userRole)) {
      throw new AppError(403, '권한이 부족합니다.', ErrorCode.FORBIDDEN);
    }
    next();
  };
}

/** 퍼미션 기반 접근 제어 — Permission.* 상수만 허용 (타입 안전) */
export function requirePermission(permission: PermissionValue) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const raw = req.headers['x-user-permissions'] as string | undefined;
    let permissions: string[] = [];
    if (raw) {
      try { permissions = JSON.parse(raw); } catch { permissions = []; }
    }
    if (permissions.includes('*') || permissions.includes(permission)) {
      return next();
    }
    throw new AppError(403, `권한 부족: '${permission}' 권한이 필요합니다.`, ErrorCode.AUTH_PERMISSION_DENIED);
  };
}

/**
 * 소유자 또는 admin만 접근 허용하는 미들웨어 팩토리.
 *
 * @param findResource  요청으로부터 리소스를 조회하는 함수 (null이면 404)
 * @param ownerField    리소스 내 소유자 ID가 담긴 필드명
 * @param errorCode     403 시 사용할 에러 코드 (기본: FORBIDDEN)
 *
 * 조회된 리소스는 `res.locals.resource`에 저장되어 핸들러에서 재사용 가능.
 */
export function requireOwnerOrAdmin<T extends Record<string, unknown>>(
  findResource: (req: Request) => Promise<T | null>,
  ownerField: keyof T & string,
  errorCode: string = ErrorCode.FORBIDDEN,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resource = await findResource(req);
    if (!resource) {
      throw new AppError(404, '리소스를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }

    const userId = req.headers['x-user-id'] as string;
    const userRole = req.headers['x-user-role'] as string;

    if (resource[ownerField] !== userId && userRole !== 'admin') {
      throw new AppError(403, '권한이 없습니다.', errorCode);
    }

    res.locals.resource = resource;
    next();
  };
}

/** 내부 서비스 간 호출 전용 — x-internal-secret 헤더 검증 */
export function requireInternalSecret(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.INTERNAL_SECRET;
  if (!expected) {
    throw new AppError(404, 'Not Found', ErrorCode.NOT_FOUND);
  }
  if (req.headers['x-internal-secret'] !== expected) {
    throw new AppError(401, '내부 요청 인증 실패', ErrorCode.INTERNAL_AUTH_FAILED);
  }
  next();
}
