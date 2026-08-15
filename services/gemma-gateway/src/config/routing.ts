/**
 * Gemma Gateway 라우팅 테이블
 *
 * **로컬 우선 정책** — 모든 기본 라우트는 로컬 Ollama로.
 * AWS vLLM 백엔드는 환경변수가 설정된 경우만 활성화.
 *
 * 모델 alias 형식: `<family>:<size>` 또는 `<family>:<size>@<backend>`
 * 예) `gemma4:e4b`, `gemma4:26b`, `gemma4:26b@vllm-aws`, `bge-m3`, `gpt-4o-mini`
 */

export type BackendKind = 'ollama' | 'vllm' | 'openai';

export interface BackendConfig {
  kind: BackendKind;
  baseUrl: string;
  apiKey?: string;
  /** 백엔드에서 실제로 호출할 모델 이름 (alias != real name 인 경우) */
  realModel: string;
  /** 라우팅 라벨 (로깅/감사용) */
  label: string;
  /** 활성화 여부 — false면 라우팅 테이블에서 제외 */
  enabled: boolean;
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434/v1';
const VLLM_BASE_URL = process.env.VLLM_BASE_URL || ''; // 비어 있으면 비활성
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const HAS_VLLM = VLLM_BASE_URL.length > 0;
const HAS_OPENAI = OPENAI_API_KEY.length > 0;

/**
 * Alias → Backend 매핑.
 * 로컬 우선: 같은 모델이 여러 백엔드에 있으면 ollama가 기본.
 */
export const ROUTING_TABLE: Record<string, BackendConfig> = {
  // ─── Gemma 4 (Ollama 로컬 — 기본) ─────────────────────────
  'gemma4:e2b': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'gemma4:e2b',
    label: 'ollama-local/gemma4-e2b',
    enabled: true,
  },
  'gemma4:e4b': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'gemma4:e4b',
    label: 'ollama-local/gemma4-e4b',
    enabled: true,
  },
  'gemma4:26b': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'gemma4:26b',
    label: 'ollama-local/gemma4-26b',
    enabled: true,
  },
  'gemma4:31b': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'gemma4:31b',
    label: 'ollama-local/gemma4-31b',
    enabled: true,
  },
  // 호환 alias — 차후 vLLM으로 옮길 때 코드 변경 없이 라우팅만 변경
  'gemma4:latest': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'gemma4:latest',
    label: 'ollama-local/gemma4-latest',
    enabled: true,
  },

  // ─── 메모리 제약 환경용 fallback (Gemma 3 — 작은 모델) ──────────
  // Docker WSL2 RAM이 8GB 미만이면 Gemma 4가 OOM. 1B로 파이프라인만 검증.
  'gemma3:1b': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'gemma3:1b',
    label: 'ollama-local/gemma3-1b (fallback)',
    enabled: true,
  },
  'gemma3:4b': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'gemma3:4b',
    label: 'ollama-local/gemma3-4b (fallback)',
    enabled: true,
  },

  // ─── 임베딩 (Ollama 로컬) ─────────────────────────
  'bge-m3': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'bge-m3',
    label: 'ollama-local/bge-m3',
    enabled: true,
  },
  'nomic-embed-text': {
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    realModel: 'nomic-embed-text',
    label: 'ollama-local/nomic-embed-text',
    enabled: true,
  },

  // ─── vLLM (AWS 또는 로컬 GPU 노드) — 설정 시만 활성 ─────────────
  'gemma4:26b@vllm': {
    kind: 'vllm',
    baseUrl: VLLM_BASE_URL,
    realModel: 'google/gemma-4-26B-A4B-it',
    label: 'vllm/gemma-4-26B-A4B-it',
    enabled: HAS_VLLM,
  },
  'gemma4:31b@vllm': {
    kind: 'vllm',
    baseUrl: VLLM_BASE_URL,
    realModel: 'google/gemma-4-31B-it',
    label: 'vllm/gemma-4-31B-it',
    enabled: HAS_VLLM,
  },

  // ─── OpenAI (베이스라인 비교) — API 키 있을 때만 ─────────────
  'gpt-4o-mini': {
    kind: 'openai',
    baseUrl: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY,
    realModel: 'gpt-4o-mini',
    label: 'openai/gpt-4o-mini',
    enabled: HAS_OPENAI,
  },
  'text-embedding-3-small': {
    kind: 'openai',
    baseUrl: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY,
    realModel: 'text-embedding-3-small',
    label: 'openai/text-embedding-3-small',
    enabled: HAS_OPENAI,
  },
};

/**
 * 모델 alias → 백엔드 설정 해석.
 * 비활성화된 백엔드면 null 반환.
 */
export function resolveModel(alias: string): BackendConfig | null {
  const cfg = ROUTING_TABLE[alias];
  if (!cfg || !cfg.enabled) return null;
  return cfg;
}

/** 활성 모델 alias 목록 (OpenAI /v1/models 응답용) */
export function listEnabledAliases(): string[] {
  return Object.entries(ROUTING_TABLE)
    .filter(([, cfg]) => cfg.enabled)
    .map(([alias]) => alias);
}

/** 시작 시 라우팅 테이블 요약 로그용 */
export function summarizeRouting(): string {
  const lines = Object.entries(ROUTING_TABLE).map(
    ([alias, cfg]) => `  ${cfg.enabled ? '✓' : '✗'} ${alias.padEnd(28)} → ${cfg.label}`
  );
  return ['[gemma-gateway] routing table:', ...lines].join('\n');
}
