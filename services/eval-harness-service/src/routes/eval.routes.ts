import { FastifyPluginAsync } from 'fastify';
import { runSmokeEval } from '../evaluators/smoke.evaluator';
import { AppError, ErrorCode } from '@lab/shared';
import { enqueueEval, getJobStatus } from '../lib/eval-queue';

const evalRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /eval/smoke
   * Body: { model: string }
   *
   * 단발 smoke 테스트 — gemma-gateway → 모델 → 응답을 MLflow에 기록
   */
  app.post('/smoke', async (req) => {
    const body = (req.body ?? {}) as { model?: string };
    if (!body.model) {
      throw new AppError(400, 'model 필드가 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }
    const result = await runSmokeEval(body.model);
    return { ok: true, data: result };
  });

  /**
   * POST /eval/compare
   * Body: { models: string[] }
   *
   * 여러 모델을 같은 smoke 셋으로 돌려 결과 비교 — 각 모델별 MLflow run 생성.
   */
  app.post('/compare', async (req) => {
    const body = (req.body ?? {}) as { models?: string[] };
    if (!body.models || body.models.length === 0) {
      throw new AppError(400, 'models 배열이 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }
    const results = [];
    for (const model of body.models) {
      try {
        results.push(await runSmokeEval(model));
      } catch (err) {
        results.push({ modelId: model, error: (err as Error).message });
      }
    }
    return { ok: true, data: results };
  });

  /**
   * POST /eval/async
   * Body: { evalType: 'smoke'|'kmmlu'|'eln-qa'|'rag', model: string, datasetId?, config? }
   *
   * 비동기 큐 기반 평가 실행. 대규모 벤치마크용.
   */
  app.post('/async', async (req) => {
    const body = (req.body ?? {}) as {
      evalType?: string;
      model?: string;
      datasetId?: string;
      config?: Record<string, unknown>;
    };
    if (!body.evalType || !body.model) {
      throw new AppError(400, 'evalType과 model 필드가 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }
    const jobId = await enqueueEval({
      evalType: body.evalType as 'smoke' | 'kmmlu' | 'eln-qa' | 'rag',
      model: body.model,
      datasetId: body.datasetId,
      config: body.config,
      requestedBy: (req.headers['x-user-id'] as string) || undefined,
    });
    return { ok: true, data: { jobId } };
  });

  /**
   * GET /eval/jobs/:jobId
   * 비동기 평가 잡 상태 조회
   */
  app.get('/jobs/:jobId', async (req) => {
    const { jobId } = req.params as { jobId: string };
    try {
      const status = await getJobStatus(jobId);
      return { ok: true, data: status };
    } catch {
      throw new AppError(404, '잡을 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }
  });
};

export default evalRoutes;
