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
    try {
      permissions = raw ? JSON.parse(raw) : [];
    } catch {
      return res.status(400).json({ ok: false, error: '잘못된 권한 헤더 형식입니다.' });
    }
    if (permissions.includes('*') || permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({ ok: false, error: `권한 부족: '${permission}' 권한이 필요합니다.` });
  };
}

/** 내부 서비스 간 호출 전용 미들웨어 (x-internal-secret 헤더 검증) */
export function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.INTERNAL_SECRET;
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'INTERNAL_SECRET이 설정되지 않았습니다.' });
  }
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== expected) {
    return res.status(403).json({ ok: false, error: '내부 서비스 전용 엔드포인트입니다.' });
  }
  next();
}
