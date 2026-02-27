/** 템플릿 추천 요청 인터페이스 */
export interface IRecommendRequest {
  topic: string;
  context?: string;
}

/** 템플릿 추천 결과 인터페이스 */
export interface IRecommendation {
  templateId: string;
  title: string;
  description: string;
  matchScore: number;
  reason: string;
}

/** 초안 생성 요청 인터페이스 */
export interface IDraftRequest {
  templateId: string;
  topic: string;
  parameters?: Record<string, any>;
}

/** 초안 생성 결과 인터페이스 */
export interface IDraftResponse {
  content: string;
  templateId: string;
  generatedAt: string;
}

/** 벡터 인덱싱 요청 인터페이스 */
export interface IIndexRequest {
  documentId: string;
  documentType: 'note' | 'protocol';
  content: string;
}

/** RAG 질의 인터페이스 */
export interface IAskRequest {
  question: string;
  context?: string;
  maxResults?: number;
}

/** RAG 응답 인터페이스 */
export interface IAskResponse {
  answer: string;
  sources: Array<{ documentId: string; title: string; relevance: number }>;
  generatedAt: string;
}

/** 인덱싱 상태 인터페이스 */
export interface IIndexStatus {
  totalDocuments: number;
  indexedDocuments: number;
  lastIndexedAt: string;
  status: 'idle' | 'indexing' | 'error';
}
