/**
 * Smoke Evaluator — gemma-gateway가 살아있는지 확인하고 단발 호출 결과를 MLflow에 기록.
 *
 * 정식 평가셋(KMMLU/HAE-RAE/ELN-QA)이 준비되기 전, "엔드투엔드 파이프라인 동작"만 검증하는 용도.
 */
import { chatComplete } from '../lib/llm-client';
import { getOrCreateExperiment, startRun, endRun, logBatch } from '../lib/mlflow';
import { createLogger } from '@lab/shared';

const logger = createLogger('eval-harness:smoke');

const SMOKE_QUESTIONS: Array<{ id: string; question: string; expectedKeywords: string[] }> = [
  {
    id: 'smoke-001',
    question: '실험 노트(ELN)에서 전자서명의 핵심 목적 한 문장으로.',
    expectedKeywords: ['무결성', '서명', '책임'],
  },
  {
    id: 'smoke-002',
    question: 'HPLC 분석에서 retention time이 변동하는 가장 흔한 원인 3가지.',
    expectedKeywords: ['컬럼', '온도', '이동상'],
  },
  {
    id: 'smoke-003',
    question: 'Western blot에서 secondary antibody의 역할은?',
    expectedKeywords: ['검출', '신호', 'primary'],
  },
];

interface SmokeResult {
  modelId: string;
  ran: number;
  succeeded: number;
  avgLatencyMs: number;
  keywordHitRate: number;
  results: Array<{
    id: string;
    latencyMs: number;
    answer: string;
    keywordHits: number;
    error?: string;
  }>;
}

export async function runSmokeEval(model: string): Promise<SmokeResult> {
  logger.info({ model }, 'smoke eval 시작');

  const expId = await getOrCreateExperiment('gemma4-smoke');
  const runId = await startRun(expId, {
    'model.alias': model,
    'eval.kind': 'smoke',
    'eval.dataset': 'smoke-v1',
  });

  const results: SmokeResult['results'] = [];
  let totalLatency = 0;
  let succeeded = 0;
  let keywordHitTotal = 0;
  let keywordPossible = 0;

  for (const q of SMOKE_QUESTIONS) {
    try {
      const { content, latencyMs } = await chatComplete(model, [
        { role: 'system', content: '당신은 한국어로 답변하는 실험실 전문가입니다. 간결하게 답하세요.' },
        { role: 'user', content: q.question },
      ]);
      const lower = content.toLowerCase();
      const hits = q.expectedKeywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
      results.push({ id: q.id, latencyMs, answer: content, keywordHits: hits });
      totalLatency += latencyMs;
      succeeded++;
      keywordHitTotal += hits;
      keywordPossible += q.expectedKeywords.length;
    } catch (err) {
      results.push({
        id: q.id,
        latencyMs: 0,
        answer: '',
        keywordHits: 0,
        error: (err as Error).message,
      });
    }
  }

  const summary: SmokeResult = {
    modelId: model,
    ran: SMOKE_QUESTIONS.length,
    succeeded,
    avgLatencyMs: succeeded > 0 ? Math.round(totalLatency / succeeded) : 0,
    keywordHitRate:
      keywordPossible > 0 ? Math.round((keywordHitTotal / keywordPossible) * 100) / 100 : 0,
    results,
  };

  await logBatch(
    runId,
    [
      { key: 'success_count', value: summary.succeeded },
      { key: 'avg_latency_ms', value: summary.avgLatencyMs },
      { key: 'keyword_hit_rate', value: summary.keywordHitRate },
      { key: 'total_questions', value: summary.ran },
    ],
    [
      { key: 'model', value: model },
      { key: 'dataset', value: 'smoke-v1' },
      { key: 'temperature', value: '0.3' },
    ]
  );
  await endRun(runId, summary.succeeded > 0 ? 'FINISHED' : 'FAILED');

  logger.info({ summary }, 'smoke eval 완료');
  return summary;
}
