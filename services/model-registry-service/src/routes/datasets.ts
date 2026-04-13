import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { AppError, ErrorCode } from '@lab/shared';

const datasetsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth);

  // 평가셋 목록
  fastify.get('/datasets', { schema: { tags: ['datasets'] } }, async (request, reply) => {
    const { name } = request.query as { name?: string };
    const where = name ? { name } : {};

    const datasets = await fastify.prisma.evalDataset.findMany({
      where,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
    reply.send({ ok: true, data: datasets });
  });

  // 평가셋 상세
  fastify.get('/datasets/:id', { schema: { tags: ['datasets'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dataset = await fastify.prisma.evalDataset.findUnique({ where: { id } });
    if (!dataset) throw new AppError(404, '평가셋을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    reply.send({ ok: true, data: dataset });
  });

  // 평가셋 등록 (버전 자동 증가)
  fastify.post('/datasets', { schema: { tags: ['datasets'] } }, async (request, reply) => {
    const body = request.body as {
      name: string;
      sizeRows: number;
      sourceUri: string;
      schemaJson?: Record<string, unknown>;
    };

    const latest = await fastify.prisma.evalDataset.findFirst({
      where: { name: body.name },
      orderBy: { version: 'desc' },
    });

    const dataset = await fastify.prisma.evalDataset.create({
      data: {
        name: body.name,
        version: (latest?.version ?? 0) + 1,
        sizeRows: body.sizeRows,
        sourceUri: body.sourceUri,
        schemaJson: body.schemaJson ?? undefined,
        createdBy: (request.headers['x-user-id'] as string) || 'system',
      },
    });
    reply.status(201).send({ ok: true, data: dataset });
  });

  // 평가셋 삭제
  fastify.delete('/datasets/:id', { schema: { tags: ['datasets'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.evalDataset.delete({ where: { id } });
    reply.send({ ok: true, data: null });
  });
};

export default datasetsRoute;
