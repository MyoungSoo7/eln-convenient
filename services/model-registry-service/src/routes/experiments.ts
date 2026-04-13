import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { AppError, ErrorCode } from '@lab/shared';

const experimentsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth);

  // 실험 목록
  fastify.get('/experiments', { schema: { tags: ['experiments'] } }, async (request, reply) => {
    const { status, modelId, datasetId } = request.query as {
      status?: string;
      modelId?: string;
      datasetId?: string;
    };
    const where: Record<string, string> = {};
    if (status) where.status = status;
    if (modelId) where.modelId = modelId;
    if (datasetId) where.datasetId = datasetId;

    const experiments = await fastify.prisma.experiment.findMany({
      where,
      include: {
        model: { select: { id: true, name: true, baseModel: true } },
        dataset: { select: { id: true, name: true, version: true } },
        prompt: { select: { id: true, name: true, version: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send({ ok: true, data: experiments });
  });

  // 실험 상세
  fastify.get('/experiments/:id', { schema: { tags: ['experiments'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const experiment = await fastify.prisma.experiment.findUnique({
      where: { id },
      include: { model: true, dataset: true, prompt: true },
    });
    if (!experiment) throw new AppError(404, '실험을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    reply.send({ ok: true, data: experiment });
  });

  // 실험 생성
  fastify.post('/experiments', { schema: { tags: ['experiments'] } }, async (request, reply) => {
    const body = request.body as {
      name: string;
      modelId: string;
      datasetId: string;
      promptId?: string;
      config?: Record<string, unknown>;
    };

    const experiment = await fastify.prisma.experiment.create({
      data: {
        name: body.name,
        modelId: body.modelId,
        datasetId: body.datasetId,
        promptId: body.promptId,
        config: body.config ?? undefined,
        createdBy: (request.headers['x-user-id'] as string) || 'system',
      },
    });
    reply.status(201).send({ ok: true, data: experiment });
  });

  // 실험 상태/결과 업데이트 (내부 서비스 호출용)
  fastify.patch('/experiments/:id', { schema: { tags: ['experiments'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      status: string;
      metrics: Record<string, unknown>;
      mlflowRunId: string;
      errorMsg: string;
      startedAt: string;
      completedAt: string;
    }>;

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.metrics !== undefined) data.metrics = body.metrics;
    if (body.mlflowRunId !== undefined) data.mlflowRunId = body.mlflowRunId;
    if (body.errorMsg !== undefined) data.errorMsg = body.errorMsg;
    if (body.startedAt !== undefined) data.startedAt = new Date(body.startedAt);
    if (body.completedAt !== undefined) data.completedAt = new Date(body.completedAt);

    const experiment = await fastify.prisma.experiment.update({ where: { id }, data });
    reply.send({ ok: true, data: experiment });
  });

  // 실험 삭제
  fastify.delete('/experiments/:id', { schema: { tags: ['experiments'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.experiment.delete({ where: { id } });
    reply.send({ ok: true, data: null });
  });
};

export default experimentsRoute;
