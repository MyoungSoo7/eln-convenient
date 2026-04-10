import { FastifyReply, FastifyRequest } from 'fastify';
import { BackendConfig } from '../config/routing';
import { createLogger } from '@lab/shared';

const logger = createLogger('gemma-gateway');

/**
 * OpenAI 호환 백엔드로 요청을 프록시한다.
 * - 비스트리밍: JSON 응답을 그대로 전달
 * - 스트리밍(text/event-stream): 청크를 실시간 passthrough
 *
 * 모델 이름 치환: 클라이언트가 보낸 alias를 backend.realModel 로 교체.
 */
export async function proxyOpenAICompatible(
  request: FastifyRequest,
  reply: FastifyReply,
  backend: BackendConfig,
  endpoint: '/chat/completions' | '/embeddings' | '/completions'
): Promise<void> {
  const requestBody = (request.body ?? {}) as Record<string, unknown>;
  const isStream = endpoint === '/chat/completions' && requestBody.stream === true;

  // alias → realModel 치환
  const mappedBody = { ...requestBody, model: backend.realModel };

  const targetUrl = `${backend.baseUrl}${endpoint}`;
  const startedAt = Date.now();

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(backend.apiKey && { authorization: `Bearer ${backend.apiKey}` }),
      },
      body: JSON.stringify(mappedBody),
    });
  } catch (err) {
    logger.error(
      { backend: backend.label, target: targetUrl, err: (err as Error).message },
      'upstream connection failed'
    );
    reply.code(502).send({
      ok: false,
      error: `백엔드 연결 실패: ${backend.label}`,
      code: 'BACKEND_UNREACHABLE',
    });
    return;
  }

  // 비스트리밍: JSON 통째 전달
  if (!isStream) {
    const text = await upstream.text();
    const elapsedMs = Date.now() - startedAt;

    logger.info(
      {
        backend: backend.label,
        endpoint,
        status: upstream.status,
        elapsedMs,
        promptModel: backend.realModel,
        clientAlias: (requestBody.model as string) ?? '?',
      },
      'proxy completed'
    );

    reply
      .code(upstream.status)
      .header('content-type', upstream.headers.get('content-type') ?? 'application/json')
      .send(text);
    return;
  }

  // 스트리밍: SSE chunks passthrough
  if (!upstream.body) {
    reply.code(502).send({ ok: false, error: '백엔드 스트림 없음', code: 'NO_STREAM_BODY' });
    return;
  }

  reply.raw.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reply.raw.write(value);
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'stream forwarding error');
  } finally {
    reply.raw.end();
    const elapsedMs = Date.now() - startedAt;
    logger.info(
      {
        backend: backend.label,
        endpoint,
        status: upstream.status,
        elapsedMs,
        streamed: true,
      },
      'proxy stream completed'
    );
  }
}
