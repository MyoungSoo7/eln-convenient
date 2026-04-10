import { FastifyPluginAsync } from 'fastify';
import { runSmokeEval } from '../evaluators/smoke.evaluator';
import { AppError, ErrorCode } from '@lab/shared';

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
};

export default evalRoutes;
