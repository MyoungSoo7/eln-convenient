/**
 * gemma-gateway를 호출하는 OpenAI 호환 클라이언트.
 * fetch만 사용 — SDK 의존성 회피.
 */

const GEMMA_GATEWAY_URL = process.env.GEMMA_GATEWAY_URL || 'http://gemma-gateway:8010';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  choices: Array<{ message: { role: string; content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function chatComplete(
  model: string,
  messages: ChatMessage[],
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<{ content: string; latencyMs: number; usage?: ChatResponse['usage'] }> {
  const startedAt = Date.now();
  const res = await fetch(`${GEMMA_GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens ?? 1024,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gemma-gateway chat failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as ChatResponse;
  return {
    content: data.choices[0]?.message?.content ?? '',
    latencyMs: Date.now() - startedAt,
    usage: data.usage,
  };
}
