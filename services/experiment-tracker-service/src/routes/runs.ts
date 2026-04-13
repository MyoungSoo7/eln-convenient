import { FastifyPluginAsync } from 'fastify';
import { AppError, ErrorCode } from '@lab/shared';
import { searchRuns, getRun, getMetricHistory } from '../lib/mlflow-client';

const runsRoute: FastifyPluginAsync = async (app) => {
  // 실험별 Run 검색
  app.get('/experiments/:experimentId/runs', { schema: { tags: ['runs'] } }, async (req, reply) => {
    const { experimentId } = req.params as { experimentId: string };
    const { filter, max_results } = req.query as { filter?: string; max_results?: string };
    const runs = await searchRuns(
      [experimentId],
      filter,
      max_results ? parseInt(max_results, 10) : 50,
    );
    reply.send({ ok: true, data: runs });
  });

  // Run 상세
  app.get('/runs/:runId', { schema: { tags: ['runs'] } }, async (req, reply) => {
    const { runId } = req.params as { runId: string };
    try {
      const run = await getRun(runId);
      reply.send({ ok: true, data: run });
    } catch {
      throw new AppError(404, 'Run을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }
  });

  // Run 메트릭 히스토리
  app.get('/runs/:runId/metrics/:metricKey', { schema: { tags: ['runs'] } }, async (req, reply) => {
    const { runId, metricKey } = req.params as { runId: string; metricKey: string };
    try {
      const history = await getMetricHistory(runId, metricKey);
      reply.send({ ok: true, data: history });
    } catch {
      throw new AppError(404, '메트릭을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }
  });

  // 모델 간 비교 — 여러 Run의 메트릭을 한 번에 조회
  app.post('/compare', { schema: { tags: ['runs'] } }, async (req, reply) => {
    const body = req.body as { runIds: string[]; metricKeys: string[] };
    if (!body.runIds?.length || !body.metricKeys?.length) {
      throw new AppError(400, 'runIds와 metricKeys 배열이 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }

    const comparison: Record<string, Record<string, number | null>> = {};
    for (const runId of body.runIds) {
      comparison[runId] = {};
      const run = await getRun(runId);
      for (const key of body.metricKeys) {
        const metric = run.data.metrics?.find((m) => m.key === key);
        comparison[runId][key] = metric?.value ?? null;
      }
    }
    reply.send({ ok: true, data: comparison });
  });
};

export default runsRoute;
