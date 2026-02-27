import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { IRecommendation, IDraftResponse, IAskResponse, IIndexStatus } from '../interfaces/ai.interface';

/** POST /api/ai/recommend-template */
export function recommendTemplate(req: Request, res: Response): void {
  const { topic } = req.body;
  // TODO: 실제 LLM/벡터 검색 기반 추천
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
  // TODO: 실제 LLM 기반 초안 생성
  const draft: IDraftResponse = {
    templateId,
    content: `# ${topic}\n\n## 목적\n${topic}에 대한 실험을 수행하여 최적 조건을 확인한다.\n\n## 재료\n- 시약 A\n- 시약 B\n- 장비: PCR Thermocycler\n\n## 방법\n1. 시료 준비\n2. 반응 조건 설정\n3. 결과 분석\n\n## 예상 결과\n(AI 생성 초안 — 실제 결과로 교체해주세요)\n\n## 고찰\n(실험 후 작성)`,
    generatedAt: new Date().toISOString(),
  };
  res.json(draft);
}

/** POST /api/ai/index */
export function indexDocument(req: Request, res: Response): void {
  // TODO: Qdrant/pgvector 벡터 임베딩 저장
  res.status(202).json({ documentId: req.body.documentId, status: 'queued', message: '문서가 인덱싱 대기열에 추가되었습니다.' });
}

/** POST /api/ai/ask */
export function askQuestion(req: Request, res: Response): void {
  const { question } = req.body;
  // TODO: 실제 RAG 파이프라인 (임베딩 검색 → LLM 생성)
  const response: IAskResponse = {
    answer: `"${question}"에 대한 답변입니다 (더미 응답).\n\n관련 실험 노트와 프로토콜을 기반으로 분석한 결과, 최적 조건은 다음과 같습니다:\n- 온도: 37°C\n- 시간: 2시간\n- pH: 7.4\n\n자세한 내용은 참고 문서를 확인해주세요.`,
    sources: [
      { documentId: 'note-001', title: 'PCR 최적화 실험', relevance: 0.91 },
      { documentId: 'note-002', title: '세포 배양 기록 #42', relevance: 0.76 },
    ],
    generatedAt: new Date().toISOString(),
  };
  res.json(response);
}

/** GET /api/ai/index/status */
export function getIndexStatus(_req: Request, res: Response): void {
  const status: IIndexStatus = {
    totalDocuments: 156,
    indexedDocuments: 142,
    lastIndexedAt: '2024-01-15T14:30:00Z',
    status: 'idle',
  };
  res.json(status);
}
