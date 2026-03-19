/**
 * 검색 서비스 API 클라이언트
 * 경로: /api/search/*
 * 백엔드: GET /api/search?q=...&type=note,protocol,inventory&page=1&size=20
 */
import apiClient, { type ApiResponse } from './client';

/** 검색 결과 1건 (노트/프로토콜/인벤토리 공통) */
export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  type: string;
  score: number;
  highlight?: Record<string, string[]>;
  createdAt?: string;
}

/** 타입별 검색 결과 (통합검색 페이지용) */
export interface SearchResults {
  notes: SearchResult[];
  protocols: SearchResult[];
  inventory: SearchResult[];
}

/** 백엔드 검색 API 응답 (results 배열 + domainType 필드로 구분) */
interface SearchApiResponse {
  ok: boolean;
  query?: string;
  results?: Array<{
    docId: string;
    domainType: string;
    title: string;
    snippet: string;
    score: number;
    highlight?: Record<string, string[]>;
    createdAt?: string;
  }>;
  total?: number;
  page?: number;
  size?: number;
  took?: number;
  error?: string;
}

type ApiResult = NonNullable<SearchApiResponse['results']>[number];

/** 백엔드 domainType: NOTE | TEMPLATE | INVENTORY → 프론트 note | protocol | inventory */
function mapResult(r: ApiResult): SearchResult {
  const typeMap: Record<string, string> = {
    NOTE: 'note',
    TEMPLATE: 'protocol',
    PROTOCOL: 'protocol',
    INVENTORY: 'inventory',
  };
  return {
    id: r.docId,
    title: r.title,
    snippet: r.snippet,
    type: typeMap[r.domainType] ?? r.domainType,
    score: r.score,
    highlight: r.highlight,
    createdAt: r.createdAt,
  };
}

/**
 * 통합 검색 (노트, 프로토콜, 인벤토리)
 * @param q 검색어
 * @param type 선택적: "note", "protocol", "inventory" 또는 콤마 구분 (미입력 시 전체)
 * @param page 페이지 (1부터)
 * @param size 페이지 크기
 */
export async function search(
  q: string,
  type?: string,
  page = 1,
  size = 20
): Promise<ApiResponse<SearchResults & { total: number; page: number; size: number; took?: number }>> {
  const params: Record<string, string> = { q: q.trim(), page: String(page), size: String(size) };
  if (type) params.domainTypes = type.toUpperCase();

  try {
    const res = await apiClient.get<SearchApiResponse>('/search', params);
    if (!res.ok) {
      return {
        ok: false,
        data: {
          notes: [],
          protocols: [],
          inventory: [],
          total: 0,
          page: 1,
          size,
        },
        error: (res as SearchApiResponse).error,
      };
    }

    const results = (res as SearchApiResponse).results ?? [];
    const notes = results.filter((r) => r.domainType === 'NOTE').map(mapResult);
    const protocols = results.filter((r) => r.domainType === 'TEMPLATE' || r.domainType === 'PROTOCOL').map(mapResult);
    const inventory = results.filter((r) => r.domainType === 'INVENTORY').map(mapResult);

    return {
      ok: true,
      data: {
        notes,
        protocols,
        inventory,
        total: (res as SearchApiResponse).total ?? 0,
        page: (res as SearchApiResponse).page ?? 1,
        size: (res as SearchApiResponse).size ?? size,
        took: (res as SearchApiResponse).took,
      },
    };
  } catch {
    return {
      ok: false,
      data: {
        notes: [],
        protocols: [],
        inventory: [],
        total: 0,
        page: 1,
        size,
      },
      error: '검색 요청에 실패했습니다.',
    };
  }
}

/** 자동완성 제안 (백엔드 GET /api/search/suggest) */
interface SuggestApiResponse {
  ok: boolean;
  query?: string;
  suggestions?: Array<{ text: string; type: string; id: string }>;
}

export async function getSuggestions(q: string): Promise<ApiResponse<string[]>> {
  if (!q.trim()) return { ok: true, data: [] };
  try {
    const res = await apiClient.get<SuggestApiResponse>('/search/suggest', { q: q.trim() });
    const list = (res as SuggestApiResponse).suggestions ?? [];
    return { ok: true, data: list.map((s) => s.text) };
  } catch {
    return { ok: true, data: [] };
  }
}
