/**
 * AI 어시스턴트 서비스 API 클라이언트
 * 경로: /api/ai/*
 */
import apiClient, { type ApiResponse } from './client';

export interface TemplateRecommendation {
  templateId: string;
  name: string;
  score: number;
  reason: string;
}

export interface DraftResult {
  title: string;
  sections: { type: string; title: string; content: string }[];
  generatedAt: string;
}

export interface AskResult {
  answer: string;
  sources: { noteId: string; title: string; relevance: number }[];
}

export interface IndexStatus {
  totalDocuments: number;
  indexedDocuments: number;
  pendingDocuments: number;
  lastUpdated: string;
}

export async function recommendTemplate(topic: string, keywords?: string[]): Promise<ApiResponse<TemplateRecommendation[]>> {
  try {
    return await apiClient.post<TemplateRecommendation[]>('/ai/recommend-template', { topic, keywords });
  } catch {
    return { ok: false, data: [] as TemplateRecommendation[], error: '템플릿 추천 요청에 실패했습니다.' };
  }
}

export async function generateDraft(templateId: string, topic: string, context?: string): Promise<ApiResponse<DraftResult>> {
  try {
    return await apiClient.post<DraftResult>('/ai/draft', { templateId, topic, context });
  } catch {
    return { ok: false, data: null as unknown as DraftResult, error: '초안 생성 요청에 실패했습니다.' };
  }
}

export async function askQuestion(question: string): Promise<ApiResponse<AskResult>> {
  try {
    return await apiClient.post<AskResult>('/ai/ask', { question });
  } catch {
    return { ok: false, data: null as unknown as AskResult, error: 'AI 질문 요청에 실패했습니다.' };
  }
}

export async function getIndexStatus(): Promise<ApiResponse<IndexStatus>> {
  try {
    return await apiClient.get<IndexStatus>('/ai/index-status');
  } catch {
    return { ok: false, data: null as unknown as IndexStatus, error: '인덱싱 상태 조회에 실패했습니다.' };
  }
}
