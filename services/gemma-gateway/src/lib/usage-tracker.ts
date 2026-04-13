import { createLogger } from '@lab/shared';

const logger = createLogger('gemma-gateway');

/**
 * 사용량 추적기
 *
 * 모델 호출 횟수, 토큰 사용량, 비용 추정을 인메모리로 집계한다.
 * 프로덕션에서는 Redis 또는 PostgreSQL로 영속화할 수 있다.
 */

interface UsageEntry {
  model: string;
  backend: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

// 모델별 인메모리 집계
const usageMap = new Map<string, UsageEntry>();

// 대략적 비용 추정 ($/1K tokens) — 연구용 참고값
const COST_PER_1K: Record<string, { prompt: number; completion: number }> = {
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
  // 로컬 모델은 전기세/감가상각으로 산정해야 하지만 여기서는 0
  default: { prompt: 0, completion: 0 },
};

export function trackUsage(
  model: string,
  backend: string,
  promptTokens: number,
  completionTokens: number,
): void {
  const key = `${model}@${backend}`;
  const existing = usageMap.get(key) || {
    model,
    backend,
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };

  const rates = COST_PER_1K[model] || COST_PER_1K.default;
  const cost =
    (promptTokens / 1000) * rates.prompt +
    (completionTokens / 1000) * rates.completion;

  existing.calls += 1;
  existing.promptTokens += promptTokens;
  existing.completionTokens += completionTokens;
  existing.totalTokens += promptTokens + completionTokens;
  existing.estimatedCostUsd += cost;

  usageMap.set(key, existing);
}

export function getUsageSummary(): UsageEntry[] {
  return Array.from(usageMap.values());
}

export function resetUsage(): void {
  usageMap.clear();
}
