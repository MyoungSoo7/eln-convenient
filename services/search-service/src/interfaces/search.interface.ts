/** 검색 결과 인터페이스 */
export interface ISearchResult {
  id: string;
  type: 'note' | 'protocol' | 'inventory';
  title: string;
  snippet: string;
  score: number;
  highlight: Record<string, string[]>;
  createdAt: string;
}

/** 검색 응답 인터페이스 */
export interface ISearchResponse {
  query: string;
  results: ISearchResult[];
  total: number;
  page: number;
  size: number;
  took: number; // ms
}

/** 자동완성 제안 인터페이스 */
export interface ISuggestion {
  text: string;
  type: 'note' | 'protocol' | 'inventory';
  id: string;
}
