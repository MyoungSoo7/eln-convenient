import { Request, Response } from 'express';
import { IRecommendation, IDraftResponse, IAskResponse, IIndexStatus } from '../interfaces/ai.interface';
import { ragQuery, recommendByVector, generateDraftWithLLM } from '../services/rag.service';
import { getIndexedCount, deleteDocument } from '../services/qdrant.service';
import { enqueueIndex } from '../workers/index.worker';

// ─────────────────────────────────────────────
// 사용자 AI 기능
// ─────────────────────────────────────────────

/** POST /api/ai/recommend-template */
export async function recommendTemplate(req: Request, res: Response): Promise<void> {
  const { topic, keywords, limit } = req.body;
  if (!topic) {
    res.status(400).json({ ok: false, error: 'topic 필드가 필요합니다.' });
    return;
  }

  const topK = Math.min(10, Math.max(1, Number.parseInt(limit) || 3));
  // keywords가 있으면 topic에 결합하여 더 풍부한 벡터 생성
  const queryText = keywords?.length ? `${topic} ${(keywords as string[]).join(' ')}` : topic;

  try {
    const vectorHits = await recommendByVector(queryText, topK);
    if (vectorHits.length > 0) {
      const recommendations: IRecommendation[] = vectorHits.map((h) => ({
        templateId: h.templateId,
        title: h.title,
        description: '인덱싱된 프로토콜에서 유사한 템플릿을 찾았습니다.',
        matchScore: h.score,
        reason: `벡터 유사도 기반 추천 (유사도: ${(h.score * 100).toFixed(1)}%)`,
      }));
      res.json({ ok: true, topic, recommendations });
      return;
    }
  } catch (e) {
    console.warn('[recommend] 벡터 검색 실패, 기본 추천 반환:', (e as Error).message);
  }

  // Fallback
  const recommendations: IRecommendation[] = [
    { templateId: 'tmpl-001', title: '일반 실험 노트', description: '목적/재료/방법/결과/고찰 구조', matchScore: 0.92, reason: `'${topic}' 주제에 적합한 범용 실험 노트 형식입니다.` },
    { templateId: 'tmpl-002', title: 'PCR 프로토콜', description: 'PCR 실험 전용 템플릿', matchScore: 0.85, reason: '분자생물학 실험에 최적화된 구조입니다.' },
    { templateId: 'tmpl-003', title: '세포배양 기록', description: '세포주 계대/배양 기록 템플릿', matchScore: 0.73, reason: '세포 관련 실험 기록에 유용합니다.' },
  ];
  res.json({ ok: true, topic, recommendations });
}

/** POST /api/ai/draft */
export async function generateDraft(req: Request, res: Response): Promise<void> {
  const { templateId, topic, context, keywords } = req.body;
  if (!templateId || !topic) {
    res.status(400).json({ ok: false, error: 'templateId, topic 필드가 필요합니다.' });
    return;
  }

  try {
    const content = await generateDraftWithLLM(topic, templateId, context, keywords);
    const draft: IDraftResponse = {
      templateId,
      content,
      generatedAt: new Date().toISOString(),
    };
    res.json({ ok: true, data: draft });
  } catch (e) {
    console.error('[draft] 초안 생성 실패:', (e as Error).message);
    res.status(500).json({ ok: false, error: '초안 생성 중 오류가 발생했습니다.' });
  }
}

/** POST /api/ai/ask — RAG 질의 */
export async function askQuestion(req: Request, res: Response): Promise<void> {
  const { question, context, limit } = req.body;
  if (!question) {
    res.status(400).json({ ok: false, error: 'question 필드가 필요합니다.' });
    return;
  }

  try {
    const result = await ragQuery(question, {
      context,
      limit: limit ? Math.min(10, Math.max(1, Number.parseInt(limit))) : 5,
    });
    const response: IAskResponse = {
      answer: result.answer,
      sources: result.sources,
      generatedAt: result.generatedAt,
    };
    res.json({ ok: true, data: response });
  } catch (e) {
    console.error('[ask] RAG 실패:', (e as Error).message);
    res.status(500).json({ ok: false, error: 'RAG 질의 처리 실패' });
  }
}

// ─────────────────────────────────────────────
// 인덱스 관리 (내부 서비스 전용)
// ─────────────────────────────────────────────

/** POST /api/ai/index — 문서 벡터 인덱싱 요청 */
export async function indexDocument(req: Request, res: Response): Promise<void> {
  const { documentId, title, content, service = 'eln' } = req.body;
  if (!documentId || !title || !content) {
    res.status(400).json({ ok: false, error: 'documentId, title, content 필드가 필요합니다.' });
    return;
  }
  try {
    const jobId = await enqueueIndex({ documentId, title, content, service });
    res.status(202).json({
      ok: true,
      documentId,
      jobId,
      status: 'queued',
      message: '문서가 인덱싱 대기열에 추가되었습니다.',
    });
  } catch (e) {
    console.error('[index] 큐 추가 실패:', (e as Error).message);
    res.status(500).json({ ok: false, error: '인덱싱 요청 실패' });
  }
}

/** DELETE /api/ai/index/:documentId — 문서 벡터 삭제 */
export async function removeDocument(req: Request, res: Response): Promise<void> {
  const { documentId } = req.params;
  try {
    await deleteDocument(documentId);
    res.json({ ok: true, documentId, message: '문서가 벡터 인덱스에서 삭제되었습니다.' });
  } catch (e) {
    console.error('[index/delete] 삭제 실패:', (e as Error).message);
    res.status(500).json({ ok: false, error: '벡터 인덱스 삭제 실패' });
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
    res.json({ ok: true, data: status });
  } catch {
    res.json({
      ok: false,
      data: { totalDocuments: 0, indexedDocuments: 0, lastIndexedAt: '', status: 'error' } as IIndexStatus,
    });
  }
}
