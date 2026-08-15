/**
 * MLflow REST API 클라이언트 (읽기 전용 프록시)
 *
 * experiment-tracker-service는 MLflow의 읽기 API를 래핑해
 * LabNote 인증/권한 체계 하에서 접근 가능하게 만든다.
 */

const MLFLOW_URL = process.env.MLFLOW_URL || 'http://mlflow:5000';

async function mlflowGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`/api/2.0/mlflow${path}`, MLFLOW_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MLflow GET ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

async function mlflowPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${MLFLOW_URL}/api/2.0/mlflow${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MLflow POST ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

// ── Experiments ──────────────────────────────────────────

export interface MlflowExperiment {
  experiment_id: string;
  name: string;
  artifact_location: string;
  lifecycle_stage: string;
}

export async function listExperiments(): Promise<MlflowExperiment[]> {
  const data = await mlflowPost<{ experiments?: MlflowExperiment[] }>(
    '/experiments/search',
    { max_results: 100 },
  );
  return data.experiments ?? [];
}

export async function getExperiment(id: string): Promise<MlflowExperiment> {
  const data = await mlflowGet<{ experiment: MlflowExperiment }>(
    '/experiments/get',
    { experiment_id: id },
  );
  return data.experiment;
}

// ── Runs ─────────────────────────────────────────────────

export interface MlflowRun {
  info: {
    run_id: string;
    experiment_id: string;
    status: string;
    start_time: number;
    end_time?: number;
  };
  data: {
    metrics?: Array<{ key: string; value: number; timestamp: number; step: number }>;
    params?: Array<{ key: string; value: string }>;
    tags?: Array<{ key: string; value: string }>;
  };
}

export async function searchRuns(
  experimentIds: string[],
  filter?: string,
  maxResults = 50,
): Promise<MlflowRun[]> {
  const data = await mlflowPost<{ runs?: MlflowRun[] }>('/runs/search', {
    experiment_ids: experimentIds,
    filter: filter || '',
    max_results: maxResults,
    order_by: ['start_time DESC'],
  });
  return data.runs ?? [];
}

export async function getRun(runId: string): Promise<MlflowRun> {
  const data = await mlflowGet<{ run: MlflowRun }>('/runs/get', { run_id: runId });
  return data.run;
}

// ── Metrics History ──────────────────────────────────────

export interface MetricHistory {
  metrics: Array<{ key: string; value: number; timestamp: number; step: number }>;
}

export async function getMetricHistory(runId: string, metricKey: string): Promise<MetricHistory> {
  return mlflowGet<MetricHistory>('/metrics/get-history', {
    run_id: runId,
    metric_key: metricKey,
  });
}
