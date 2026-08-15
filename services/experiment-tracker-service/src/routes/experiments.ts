import { FastifyPluginAsync } from 'fastify';
import { AppError, ErrorCode } from '@lab/shared';
import { listExperiments, getExperiment } from '../lib/mlflow-client';

const experimentsRoute: FastifyPluginAsync = async (app) => {
  // 실험 목록
  app.get('/experiments', { schema: { tags: ['experiments'] } }, async (_req, reply) => {
    const experiments = await listExperiments();
    reply.send({ ok: true, data: experiments });
  });

  // 실험 상세
  app.get('/experiments/:id', { schema: { tags: ['experiments'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const experiment = await getExperiment(id);
      reply.send({ ok: true, data: experiment });
    } catch {
      throw new AppError(404, '실험을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }
  });
};

export default experimentsRoute;
