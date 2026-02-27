export interface RecommendTemplateDto {
  topic: string;
  keywords?: string[];
  limit?: number;
}

export interface GenerateDraftDto {
  templateId: string;
  topic: string;
  context?: string;
  keywords?: string[];
}

export interface IndexDocumentDto {
  documentId: string;
  documentType: 'note' | 'protocol';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AskQuestionDto {
  question: string;
  context?: string;
  limit?: number;
}
