import { Request, Response, NextFunction } from 'express';

// JWT 검증을 건너뛸 경로
const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/register'];

/**
 * JWT 인증 미들웨어 (스캐폴드: 실제 검증은 TODO)
 * 현재는 헤더에서 토큰을 추출하고, X-User-Id를 더미로 주입합니다.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 공개 경로는 통과
  if (PUBLIC_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // TODO: 실제 환경에서는 401 반환
    // 개발 편의를 위해 더미 사용자 주입
    req.headers['x-user-id'] = 'dev-user-001';
    req.headers['x-user-role'] = 'admin';
    return next();
  }

  const token = authHeader.split(' ')[1];

  // TODO: 실제 JWT 검증 구현
  // - jsonwebtoken.verify(token, secret)
  // - 만료 확인
  // - 사용자 정보 추출
  console.log('[auth] 토큰 수신 (검증 TODO):', token.substring(0, 20) + '...');

  // 더미 사용자 정보 주입
  req.headers['x-user-id'] = 'dev-user-001';
  req.headers['x-user-role'] = 'admin';

  next();
}
