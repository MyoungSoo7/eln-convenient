import { Request, Response } from 'express';
import { IRecommendation, IDraftResponse, IAskResponse, IIndexStatus } from '../interfaces/ai.interface';
import { ragQuery, recommendByVector } from '../services/rag.service';
import { getIndexedCount } from '../services/qdrant.service';
import { enqueueIndex } from '../workers/index.worker';

/** POST /api/ai/recommend-template */
export async function recommendTemplate(req: Request, res: Response): Promise<void> {
  const { topic } = req.body;
  if (!topic) { res.status(400).json({ ok: false, error: 'topic 필드가 필요합니다.' }); return; }

  try {
    const vectorHits = await recommendByVector(topic);
    if (vectorHits.length > 0) {
      const recommendations: IRecommendation[] = vectorHits.map((h) => ({
        templateId: h.templateId,
        title: h.title,
        description: '실험 노트에서 유사한 프로토콜을 찾았습니다.',
        matchScore: h.score,
        reason: `벡터 유사도 기반 추천 (유사도: ${(h.score * 100).toFixed(1)}%)`,
      }));
      res.json({ topic, recommendations });
      return;
    }
  } catch (e) {
    console.warn('[recommend] 벡터 검색 실패, 기본 추천 반환:', (e as Error).message);
  }

  // 기본 추천 fallback
  const recommendations: IRecommendation[] = [
    { templateId: 'tmpl-001', title: '일반 실험 노트', description: '목적/재료/방법/결과/고찰 구조', matchScore: 0.92, reason: `'${topic}' 주제에 적합한 범용 실험 노트 형식입니다.` },
    { templateId: 'tmpl-002', title: 'PCR 프로토콜', description: 'PCR 실험 전용 템플릿', matchScore: 0.85, reason: '분자생물학 실험에 최적화된 구조입니다.' },
    { templateId: 'tmpl-003', title: '세포배양 기록', description: '세포주 계대/배양 기록 템플릿', matchScore: 0.73, reason: '세포 관련 실험 기록에 유용합니다.' },
  ];
  res.json({ topic, recommendations });
}

/** POST /api/ai/draft */
export function generateDraft(req: Request, res: Response): void {
  const { templateId, topic } = req.body;
  if (!templateId || !topic) { res.status(400).json({ ok: false, error: 'templateId, topic 필드가 필요합니다.' }); return; }

  const draft: IDraftResponse = {
    templateId,
    content: `# ${topic}\n\n## 목적\n${topic}에 대한 실험을 수행하여 최적 조건을 확인한다.\n\n## 재료\n- 시약 A\n- 시약 B\n- 장비: PCR Thermocycler\n\n## 방법\n1. 시료 준비\n2. 반응 조건 설정\n3. 결과 분석\n\n## 예상 결과\n(AI 생성 초안 — 실제 결과로 교체해주세요)\n\n## 고찰\n(실험 후 작성)`,
    generatedAt: new Date().toISOString(),
  };
  res.json(draft);
}

/** POST /api/ai/index — 문서 벡터 인덱싱 요청 */
export async function indexDocument(req: Request, res: Response): Promise<void> {
  const { documentId, title, content, service = 'eln' } = req.body;
  if (!documentId || !title || !content) {
    res.status(400).json({ ok: false, error: 'documentId, title, content 필드가 필요합니다.' });
    return;
  }
  try {
    const jobId = await enqueueIndex({ documentId, title, content, service });
    res.status(202).json({ documentId, jobId, status: 'queued', message: '문서가 인덱싱 대기열에 추가되었습니다.' });
  } catch (e) {
    console.error('[index] 큐 추가 실패:', (e as Error).message);
    res.status(500).json({ ok: false, error: '인덱싱 요청 실패' });
  }
}

/** POST /api/ai/ask — RAG 질의 */
export async function askQuestion(req: Request, res: Response): Promise<void> {
  const { question } = req.body;
  if (!question) { res.status(400).json({ ok: false, error: 'question 필드가 필요합니다.' }); return; }

  try {
    const result = await ragQuery(question);
    const response: IAskResponse = {
      answer: result.answer,
      sources: result.sources,
      generatedAt: result.generatedAt,
    };
    res.json(response);
  } catch (e) {
    console.error('[ask] RAG 실패:', (e as Error).message);
    res.status(500).json({ ok: false, error: 'RAG 질의 처리 실패' });
  }
}

/** GET /api/ai/index/status */
export async function getIndexStatus(_req: Request, res: Response): Promise<void> {
  try {
    const indexed = await getIndexedCount();
    const status: IIndexStatus = {
      totalDocuments: indexed,
      indexedDocuments: indexed,
      lastIndexedAt: new Date().toISOString(),
      status: 'idle',
    };
    res.json(status);
  } catch {
    res.json({ totalDocuments: 0, indexedDocuments: 0, lastIndexedAt: '', status: 'error' } as IIndexStatus);
  }
}
