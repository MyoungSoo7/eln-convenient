import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { AppError, ErrorCode } from '@lab/shared';

const promptsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth);

  // 프롬프트 목록
  fastify.get('/prompts', { schema: { tags: ['prompts'] } }, async (request, reply) => {
    const { name } = request.query as { name?: string };
    const where = name ? { name } : {};

    const prompts = await fastify.prisma.promptTemplate.findMany({
      where,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
    reply.send({ ok: true, data: prompts });
  });

  // 프롬프트 상세
  fastify.get('/prompts/:id', { schema: { tags: ['prompts'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const prompt = await fastify.prisma.promptTemplate.findUnique({ where: { id } });
    if (!prompt) throw new AppError(404, '프롬프트를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    reply.send({ ok: true, data: prompt });
  });

  // 프롬프트 등록 (버전 자동 증가)
  fastify.post('/prompts', { schema: { tags: ['prompts'] } }, async (request, reply) => {
    const body = request.body as { name: string; template: string };

    // 같은 이름의 최신 버전 조회
    const latest = await fastify.prisma.promptTemplate.findFirst({
      where: { name: body.name },
      orderBy: { version: 'desc' },
    });

    const prompt = await fastify.prisma.promptTemplate.create({
      data: {
        name: body.name,
        template: body.template,
        version: (latest?.version ?? 0) + 1,
        createdBy: (request.headers['x-user-id'] as string) || 'system',
      },
    });
    reply.status(201).send({ ok: true, data: prompt });
  });

  // 프롬프트 삭제
  fastify.delete('/prompts/:id', { schema: { tags: ['prompts'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.promptTemplate.delete({ where: { id } });
    reply.send({ ok: true, data: null });
  });
};

export default promptsRoute;
