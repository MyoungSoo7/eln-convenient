import { FastifyRequest, FastifyReply } from 'fastify';

/** TODO: 게이트웨이 인증 헤더 기반 미들웨어 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return reply.status(401).send({ ok: false, error: '인증이 필요합니다.' });
  }
}
