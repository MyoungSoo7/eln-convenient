import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { AppError, ErrorCode } from '@lab/shared';
import { enqueueFinetuneJob } from '../lib/finetune-queue';

const jobsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth);

  // 잡 목록
  fastify.get('/jobs', { schema: { tags: ['jobs'] } }, async (request, reply) => {
    const { status, baseModel } = request.query as { status?: string; baseModel?: string };
    const where: Record<string, string> = {};
    if (status) where.status = status;
    if (baseModel) where.baseModel = baseModel;

    const jobs = await fastify.prisma.fineTuneJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    reply.send({ ok: true, data: jobs });
  });

  // 잡 상세
  fastify.get('/jobs/:id', { schema: { tags: ['jobs'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await fastify.prisma.fineTuneJob.findUnique({ where: { id } });
    if (!job) throw new AppError(404, '파인튜닝 잡을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    reply.send({ ok: true, data: job });
  });

  // 잡 생성 + 큐 투입
  fastify.post('/jobs', { schema: { tags: ['jobs'] } }, async (request, reply) => {
    const body = request.body as {
      name: string;
      baseModel: string;
      method: string;
      datasetUri: string;
      datasetRows?: number;
      config: Record<string, unknown>;
      gpuType?: string;
      gpuCount?: number;
    };

    // DB에 잡 레코드 생성
    const job = await fastify.prisma.fineTuneJob.create({
      data: {
        name: body.name,
        baseModel: body.baseModel,
        method: body.method,
        datasetUri: body.datasetUri,
        datasetRows: body.datasetRows,
        config: body.config,
        gpuType: body.gpuType,
        gpuCount: body.gpuCount ?? 1,
        createdBy: (request.headers['x-user-id'] as string) || 'system',
      },
    });

    // BullMQ 큐에 투입
    await enqueueFinetuneJob({
      jobId: job.id,
      baseModel: job.baseModel,
      method: job.method,
      datasetUri: job.datasetUri,
      config: body.config,
      gpuType: body.gpuType,
      gpuCount: body.gpuCount,
    });

    reply.status(201).send({ ok: true, data: job });
  });

  // 잡 취소
  fastify.post('/jobs/:id/cancel', { schema: { tags: ['jobs'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await fastify.prisma.fineTuneJob.findUnique({ where: { id } });
    if (!job) throw new AppError(404, '파인튜닝 잡을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      throw new AppError(400, `이미 종료된 잡입니다: ${job.status}`, ErrorCode.VALIDATION_ERROR);
    }

    const updated = await fastify.prisma.fineTuneJob.update({
      where: { id },
      data: { status: 'cancelled', completedAt: new Date() },
    });

    // TODO: BullMQ 잡도 취소 (job.bullmqJobId로 remove)

    reply.send({ ok: true, data: updated });
  });

  // 잡 삭제
  fastify.delete('/jobs/:id', { schema: { tags: ['jobs'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await fastify.prisma.fineTuneJob.findUnique({ where: { id } });
    if (!job) throw new AppError(404, '파인튜닝 잡을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);

    if (job.status === 'training' || job.status === 'preparing') {
      throw new AppError(400, '실행 중인 잡은 삭제할 수 없습니다. 먼저 취소하세요.', ErrorCode.VALIDATION_ERROR);
    }

    await fastify.prisma.fineTuneJob.delete({ where: { id } });
    reply.send({ ok: true, data: null });
  });
};

export default jobsRoute;
