import { FastifyPluginAsync } from 'fastify';
import { requireAuth, requireInternalSecret } from '../plugins/auth';
import { AppError, ErrorCode } from '@lab/shared';

const modelsRoute: FastifyPluginAsync = async (fastify) => {
  // 내부 서비스 또는 인증 사용자
  fastify.addHook('onRequest', requireAuth);

  // 모델 목록
  fastify.get('/models', { schema: { tags: ['models'] } }, async (request, reply) => {
    const { kind, baseModel } = request.query as { kind?: string; baseModel?: string };
    const where: Record<string, string> = {};
    if (kind) where.kind = kind;
    if (baseModel) where.baseModel = baseModel;

    const models = await fastify.prisma.model.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    reply.send({ ok: true, data: models });
  });

  // 모델 상세
  fastify.get('/models/:id', { schema: { tags: ['models'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const model = await fastify.prisma.model.findUnique({
      where: { id },
      include: { experiments: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!model) throw new AppError(404, '모델을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    reply.send({ ok: true, data: model });
  });

  // 모델 등록
  fastify.post('/models', { schema: { tags: ['models'] } }, async (request, reply) => {
    const body = request.body as {
      name: string;
      baseModel: string;
      kind: string;
      format: string;
      artifactUri?: string;
      sizeBytes?: string;
      description?: string;
    };

    const model = await fastify.prisma.model.create({
      data: {
        name: body.name,
        baseModel: body.baseModel,
        kind: body.kind,
        format: body.format,
        artifactUri: body.artifactUri,
        sizeBytes: body.sizeBytes ? BigInt(body.sizeBytes) : null,
        description: body.description,
        createdBy: (request.headers['x-user-id'] as string) || 'system',
      },
    });
    reply.status(201).send({ ok: true, data: { ...model, sizeBytes: model.sizeBytes?.toString() } });
  });

  // 모델 수정
  fastify.patch('/models/:id', { schema: { tags: ['models'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string;
      description: string;
      artifactUri: string;
      sizeBytes: string;
    }>;

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.artifactUri !== undefined) data.artifactUri = body.artifactUri;
    if (body.sizeBytes !== undefined) data.sizeBytes = BigInt(body.sizeBytes);

    const model = await fastify.prisma.model.update({ where: { id }, data });
    reply.send({ ok: true, data: { ...model, sizeBytes: model.sizeBytes?.toString() } });
  });

  // 모델 삭제
  fastify.delete('/models/:id', { schema: { tags: ['models'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.model.delete({ where: { id } });
    reply.send({ ok: true, data: null });
  });
};

export default modelsRoute;
