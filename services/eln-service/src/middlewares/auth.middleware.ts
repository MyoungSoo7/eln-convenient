import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.headers['x-user-role'] as string;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ ok: false, error: '권한이 부족합니다.' });
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.headers['x-user-permissions'] as string | undefined;
    let permissions: string[] = [];
    if (raw) {
      try { permissions = JSON.parse(raw); } catch { permissions = []; }
    }
    if (permissions.includes('*') || permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({ ok: false, error: `권한 부족: '${permission}' 권한이 필요합니다.` });
  };
}
