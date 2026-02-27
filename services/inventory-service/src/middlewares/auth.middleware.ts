import { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return reply.status(401).send({ ok: false, error: '인증이 필요합니다.' });
  }
}
