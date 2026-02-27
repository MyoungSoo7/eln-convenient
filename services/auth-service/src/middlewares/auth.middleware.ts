import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * TODO: 실제 JWT 검증 + 권한 확인 미들웨어
 * 현재는 게이트웨이에서 주입한 x-user-id / x-user-role 헤더를 신뢰합니다.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return reply.status(401).send({ ok: false, error: '인증이 필요합니다.' });
  }
}

export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const userRole = req.headers['x-user-role'] as string;
    if (!roles.includes(userRole)) {
      return reply.status(403).send({ ok: false, error: '권한이 부족합니다.' });
    }
  };
}
