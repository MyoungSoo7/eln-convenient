/**
 * 검색 서비스 API 클라이언트
 * 경로: /api/search/*
 */
import apiClient, { type ApiResponse } from './client';
import { mockNotes, mockProtocols, mockInventory } from '@/lib/mockData';

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  type: string;
  score: number;
}

export interface SearchResults {
  notes: SearchResult[];
  protocols: SearchResult[];
  inventory: SearchResult[];
}

export async function search(q: string, type?: string): Promise<ApiResponse<SearchResults>> {
  try {
    const params: Record<string, string> = { q };
    if (type) params.type = type;
    return await apiClient.get<SearchResults>('/search', params);
  } catch {
    const lq = q.toLowerCase();
    return {
      ok: true,
      data: {
        notes: mockNotes
          .filter((n) => n.title.toLowerCase().includes(lq) || n.tags.some((t) => t.toLowerCase().includes(lq)))
          .map((n) => ({ id: n.id, title: n.title, snippet: n.project, type: 'note', score: 0.9 })),
        protocols: mockProtocols
          .filter((p) => p.title.toLowerCase().includes(lq))
          .map((p) => ({ id: p.id, title: p.title, snippet: p.category, type: 'protocol', score: 0.85 })),
        inventory: mockInventory
          .filter((i) => i.name.toLowerCase().includes(lq))
          .map((i) => ({ id: i.id, title: i.name, snippet: i.location, type: 'inventory', score: 0.8 })),
      },
    };
  }
}

export async function getSuggestions(q: string): Promise<ApiResponse<string[]>> {
  try {
    return await apiClient.get<string[]>('/search/suggestions', { q });
  } catch {
    return { ok: true, data: ['PCR 실험', 'Western Blot', 'CRISPR', '세포배양', 'ELISA'] };
  }
}
