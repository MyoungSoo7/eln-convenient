import { FastifyRequest, FastifyReply } from 'fastify';

// JWT 검증이 필요 없는 경로
const PUBLIC_PATHS = ['/health', '/api/auth/login', '/api/auth/register'];

/**
 * JWT 검증 미들웨어 (TODO: 실제 JWT 검증 구현)
 * 현재는 더미로 x-user-id / x-user-role 헤더를 주입합니다.
 */
export async function authHook(request: FastifyRequest, reply: FastifyReply) {
  const path = request.url;

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return;

  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    // TODO: 실제 운영에서는 401 반환
    // 개발 편의상 더미 사용자 주입
    (request.headers as any)['x-user-id'] = 'dev-user-001';
    (request.headers as any)['x-user-role'] = 'admin';
    return;
  }

  // TODO: JWT 디코딩 & 검증 (jsonwebtoken / jose 등)
  const token = authHeader.replace('Bearer ', '');
  (request.headers as any)['x-user-id'] = 'decoded-user-id';
  (request.headers as any)['x-user-role'] = 'researcher';
}
