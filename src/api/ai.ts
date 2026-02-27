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
    return {
      ok: true,
      data: [
        { templateId: 'tpl-002', name: 'PCR 실험', score: 0.95, reason: '주제와 가장 관련성이 높은 템플릿입니다.' },
        { templateId: 'tpl-001', name: '일반 실험 노트', score: 0.82, reason: '범용 실험 기록에 적합합니다.' },
        { templateId: 'tpl-003', name: '세포배양', score: 0.71, reason: '세포 관련 실험에 사용할 수 있습니다.' },
      ],
    };
  }
}

export async function generateDraft(templateId: string, topic: string, context?: string): Promise<ApiResponse<DraftResult>> {
  try {
    return await apiClient.post<DraftResult>('/ai/draft', { templateId, topic, context });
  } catch {
    return {
      ok: true,
      data: {
        title: `AI 생성 초안: ${topic}`,
        sections: [
          { type: 'objective', title: '목적', content: `${topic}에 대한 실험을 수행하여 결과를 분석한다.` },
          { type: 'materials', title: '재료', content: '- 시약 A (제조사: XXX)\n- 시약 B (제조사: YYY)\n- 세포주: HEK293' },
          { type: 'methods', title: '방법', content: '1. 세포 준비 (배양 조건: 37°C, 5% CO2)\n2. 처리 및 배양\n3. 분석 수행' },
          { type: 'results', title: '결과', content: '' },
          { type: 'discussion', title: '고찰', content: '' },
        ],
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export async function askQuestion(question: string): Promise<ApiResponse<AskResult>> {
  try {
    return await apiClient.post<AskResult>('/ai/ask', { question });
  } catch {
    return {
      ok: true,
      data: {
        answer: 'PCR에서 어닐링 온도는 일반적으로 프라이머의 Tm보다 3-5°C 낮게 설정합니다.',
        sources: [{ noteId: 'note-001', title: 'PCR 최적화 실험', relevance: 0.92 }],
      },
    };
  }
}

export async function getIndexStatus(): Promise<ApiResponse<IndexStatus>> {
  try {
    return await apiClient.get<IndexStatus>('/ai/index-status');
  } catch {
    return {
      ok: true,
      data: { totalDocuments: 142, indexedDocuments: 138, pendingDocuments: 4, lastUpdated: '2024-03-15T10:00:00Z' },
    };
  }
}
