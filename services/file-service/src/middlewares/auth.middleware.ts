import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '@lab/shared';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.headers['x-user-role'] as string;
    if (!roles.includes(userRole)) {
      throw new AppError(403, '권한이 부족합니다.', ErrorCode.FORBIDDEN);
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.headers['x-user-permissions'] as string | undefined;
    let permissions: string[] = [];
    try {
      permissions = raw ? JSON.parse(raw) : [];
    } catch {
      throw new AppError(400, '잘못된 권한 헤더 형식입니다.', ErrorCode.VALIDATION_ERROR);
    }
    if (permissions.includes('*') || permissions.includes(permission)) {
      return next();
    }
    throw new AppError(403, `권한 부족: '${permission}' 권한이 필요합니다.`, ErrorCode.AUTH_PERMISSION_DENIED);
  };
}
