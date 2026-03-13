export interface ISearchResult {
  id: string;
  type: 'note' | 'protocol' | 'inventory';
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
