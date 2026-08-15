export interface IRecommendation {
  templateId: string;
  title: string;
  description: string;
  matchScore: number;
  reason: string;
}

export interface IDraftResponse {
  templateId: string;
  content: string;
  generatedAt: string;
}

export interface IAskResponse {
  answer: string;
  sources: { documentId: string; title: string; relevance: number }[];
  generatedAt: string;
}

export interface IIndexStatus {
  totalDocuments: number;
  indexedDocuments: number;
  lastIndexedAt: string;
  status: 'idle' | 'indexing' | 'error';
}
