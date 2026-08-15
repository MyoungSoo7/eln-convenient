import { FastifyPluginAsync } from 'fastify';
import { AppError, ErrorCode } from '@lab/shared';
import { resolveModel, listEnabledAliases, ROUTING_TABLE } from '../config/routing';
import { proxyOpenAICompatible } from '../lib/proxy';

/**
 * OpenAI 호환 v1 엔드포인트
 *
 * 클라이언트는 OpenAI SDK를 그대로 사용 가능 — `baseURL`만 gemma-gateway로 설정.
 *
 *   const openai = new OpenAI({ baseURL: 'http://gemma-gateway:8010/v1', apiKey: 'dummy' });
 *   await openai.chat.completions.create({ model: 'gemma4:26b', messages: [...] });
 */
const v1Routes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/models
   * 활성화된 모델 alias 목록 반환 (OpenAI ListModels 호환 형식)
   */
  app.get('/models', async () => {
    const now = Math.floor(Date.now() / 1000);
    return {
      object: 'list',
      data: listEnabledAliases().map((id) => ({
        id,
        object: 'model',
        created: now,
        owned_by: ROUTING_TABLE[id]?.label ?? 'gemma-gateway',
      })),
    };
  });

  /**
   * POST /v1/chat/completions
   * 모델 alias로 라우팅 → 백엔드의 동일 엔드포인트로 프록시
   */
  app.post('/chat/completions', async (req, reply) => {
    const body = req.body as { model?: string } | undefined;
    if (!body?.model) {
      throw new AppError(400, 'model 필드가 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }
    const backend = resolveModel(body.model);
    if (!backend) {
      throw new AppError(
        404,
        `모델을 찾을 수 없거나 비활성 상태입니다: ${body.model}. GET /v1/models 로 활성 목록 확인.`,
        ErrorCode.NOT_FOUND
      );
    }
    await proxyOpenAICompatible(req, reply, backend, '/chat/completions');
  });

  /**
   * POST /v1/embeddings
   */
  app.post('/embeddings', async (req, reply) => {
    const body = req.body as { model?: string } | undefined;
    if (!body?.model) {
      throw new AppError(400, 'model 필드가 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }
    const backend = resolveModel(body.model);
    if (!backend) {
      throw new AppError(
        404,
        `임베딩 모델을 찾을 수 없거나 비활성 상태입니다: ${body.model}.`,
        ErrorCode.NOT_FOUND
      );
    }
    await proxyOpenAICompatible(req, reply, backend, '/embeddings');
  });

  /**
   * POST /v1/completions (legacy text completions)
   */
  app.post('/completions', async (req, reply) => {
    const body = req.body as { model?: string } | undefined;
    if (!body?.model) {
      throw new AppError(400, 'model 필드가 필요합니다.', ErrorCode.VALIDATION_ERROR);
    }
    const backend = resolveModel(body.model);
    if (!backend) {
      throw new AppError(404, `모델 없음: ${body.model}`, ErrorCode.NOT_FOUND);
    }
    await proxyOpenAICompatible(req, reply, backend, '/completions');
  });
};

export default v1Routes;
