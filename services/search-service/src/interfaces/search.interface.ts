export interface ISearchResult {
  id: string;
  type: string;  // INDICES 키: notes / templates / inventory
  title: string;
  snippet: string;
  score: number;
  highlight?: Record<string, string[]>;
  createdAt: string;
}

export interface ISuggestion {
  text: string;
  type: string;
  id: string;
}

export interface IBulkDocItem {
  id: string;
  doc: Record<string, unknown>;
}
