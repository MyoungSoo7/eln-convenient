/**
 * MLflow REST API 미니 클라이언트
 *
 * MLflow Tracking Server의 핵심 엔드포인트만 직접 호출.
 * 풀 SDK(파이썬) 없이 Node에서 실험 생성/run/메트릭 기록 가능.
 *
 * 참고: https://mlflow.org/docs/latest/rest-api.html
 */

const MLFLOW_URL = process.env.MLFLOW_URL || 'http://mlflow:5000';

interface ExperimentResponse {
  experiment_id: string;
}

interface RunResponse {
  run: { info: { run_id: string; experiment_id: string } };
}

async function mlflowPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${MLFLOW_URL}/api/2.0/mlflow${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MLflow ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

/** 실험 생성 (이름이 있으면 기존 ID 반환) */
export async function getOrCreateExperiment(name: string): Promise<string> {
  // 먼저 search
  try {
    const found = (await mlflowPost<{ experiments?: Array<{ experiment_id: string }> }>(
      '/experiments/search',
      { filter: `name = '${name}'`, max_results: 1 }
    )).experiments;
    if (found && found.length > 0) return found[0].experiment_id;
  } catch {
    /* ignore — 생성 시도 */
  }
  const created = await mlflowPost<ExperimentResponse>('/experiments/create', { name });
  return created.experiment_id;
}

/** Run 시작 */
export async function startRun(
  experimentId: string,
  tags: Record<string, string> = {}
): Promise<string> {
  const res = await mlflowPost<RunResponse>('/runs/create', {
    experiment_id: experimentId,
    start_time: Date.now(),
    tags: Object.entries(tags).map(([key, value]) => ({ key, value })),
  });
  return res.run.info.run_id;
}

/** Run 종료 */
export async function endRun(runId: string, status: 'FINISHED' | 'FAILED' = 'FINISHED'): Promise<void> {
  await mlflowPost('/runs/update', {
    run_id: runId,
    status,
    end_time: Date.now(),
  });
}

/** 단일 메트릭 기록 */
export async function logMetric(
  runId: string,
  key: string,
  value: number,
  step = 0
): Promise<void> {
  await mlflowPost('/runs/log-metric', {
    run_id: runId,
    key,
    value,
    timestamp: Date.now(),
    step,
  });
}

/** 다중 메트릭 + 파라미터 일괄 기록 */
export async function logBatch(
  runId: string,
  metrics: Array<{ key: string; value: number }> = [],
  params: Array<{ key: string; value: string }> = []
): Promise<void> {
  await mlflowPost('/runs/log-batch', {
    run_id: runId,
    metrics: metrics.map((m) => ({ ...m, timestamp: Date.now(), step: 0 })),
    params,
  });
}
