export interface RecommendTemplateDto {
  topic: string;
  keywords?: string[];
  limit?: number;
}

export interface GenerateDraftDto {
  templateId: string;
  topic: string;
  context?: string;      // 추가 컨텍스트 (실험 조건 등)
  keywords?: string[];
}

export interface IndexDocumentDto {
  documentId: string;
  title: string;                        // 문서 제목 (필수)
  content: string;
  service?: string;                     // 출처 서비스 (기본 'eln')
  documentType?: 'note' | 'protocol';  // 선택적 메타데이터
  metadata?: Record<string, unknown>;
}

export interface AskQuestionDto {
  question: string;
  context?: string;   // 추가 컨텍스트 (현재 편집 중인 노트 등)
  limit?: number;     // 검색할 유사 문서 수 (기본 5)
}
