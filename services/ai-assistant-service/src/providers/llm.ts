import OpenAI from 'openai';

/**
 * LLM/Embedding Provider 설정
 *
 * PoC: OpenAI SDK는 `baseURL`만 바꾸면 Ollama/vLLM 모두 붙는다.
 * - openai:  api.openai.com
 * - ollama:  http://ollama:11434/v1   (Gemma 3, bge-m3 등)
 * - vllm:    http://vllm:8000/v1      (프로덕션 권장)
 *
 * 환경변수:
 *   CHAT_PROVIDER       = openai | ollama | vllm    (기본 openai)
 *   EMBEDDING_PROVIDER  = openai | ollama | vllm    (기본 openai)
 *   CHAT_MODEL          = gpt-4o-mini | gemma3:12b | ...
 *   EMBEDDING_MODEL     = text-embedding-3-small | bge-m3 | ...
 *   EMBEDDING_DIM       = 1536 | 1024 | ...         (Qdrant 컬렉션 차원과 일치해야 함)
 *   OPENAI_API_KEY      = sk-...
 *   OLLAMA_BASE_URL     = http://ollama:11434/v1
 *   VLLM_BASE_URL       = http://vllm:8000/v1
 */

type Provider = 'openai' | 'ollama' | 'vllm';

const CHAT_PROVIDER = (process.env.CHAT_PROVIDER as Provider) || 'openai';
const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER as Provider) || 'openai';

// 기본 모델 — provider 기본값
// Gemma 4 (2026-04 출시, Apache 2.0): e4b=9.6GB/128K, 26b=MoE 3.8B활성/256K, 31b=20GB/256K
const DEFAULT_CHAT_MODEL: Record<Provider, string> = {
  openai: 'gpt-4o-mini',
  ollama: 'gemma4:e4b', // 안전한 기본값. 고품질은 gemma4:26b (MoE) 권장
  vllm: 'google/gemma-4-26b-it',
};
const DEFAULT_EMBEDDING_MODEL: Record<Provider, string> = {
  openai: 'text-embedding-3-small',
  ollama: 'bge-m3',
  vllm: 'BAAI/bge-m3',
};
const DEFAULT_EMBEDDING_DIM: Record<Provider, number> = {
  openai: 1536, // text-embedding-3-small
  ollama: 1024, // bge-m3
  vllm: 1024, // bge-m3
};

export const CHAT_MODEL =
  process.env.CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || DEFAULT_CHAT_MODEL[CHAT_PROVIDER];

export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL[EMBEDDING_PROVIDER];

export const EMBEDDING_DIM = process.env.EMBEDDING_DIM
  ? parseInt(process.env.EMBEDDING_DIM, 10)
  : DEFAULT_EMBEDDING_DIM[EMBEDDING_PROVIDER];

function buildClient(provider: Provider): OpenAI | null {
  switch (provider) {
    case 'openai': {
      if (!process.env.OPENAI_API_KEY) return null;
      return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    case 'ollama': {
      const baseURL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434/v1';
      return new OpenAI({ baseURL, apiKey: 'ollama' }); // dummy key 필요
    }
    case 'vllm': {
      const baseURL = process.env.VLLM_BASE_URL || 'http://vllm:8000/v1';
      return new OpenAI({ baseURL, apiKey: process.env.VLLM_API_KEY || 'vllm' });
    }
  }
}

export const chatClient = buildClient(CHAT_PROVIDER);
export const embeddingClient = buildClient(EMBEDDING_PROVIDER);

export const CHAT_ENABLED = chatClient !== null;
export const EMBEDDING_ENABLED = embeddingClient !== null;

/** 시작 시 현재 설정 로깅 */
export function logProviderConfig(): void {
  console.log(
    `[llm] chat=${CHAT_PROVIDER}:${CHAT_MODEL} (enabled=${CHAT_ENABLED}) | ` +
      `embedding=${EMBEDDING_PROVIDER}:${EMBEDDING_MODEL} dim=${EMBEDDING_DIM} (enabled=${EMBEDDING_ENABLED})`
  );
}
