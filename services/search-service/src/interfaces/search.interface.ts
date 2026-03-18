export type DomainType = 'NOTE' | 'PROTOCOL' | 'TEMPLATE' | 'INVENTORY';

export interface UnifiedSearchDoc {
  docId: string;
  domainType: DomainType;
  title: string;
  content?: string;
  summary?: string;
  tags?: string[];
  ownerId: string;
  labId?: string;
  projectId?: string;
  visibility: 'public' | 'private';
  docStatus: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface ISearchResult {
  docId: string;
  domainType: DomainType;
  title: string;
  snippet: string;
  score: number;
  highlight?: Record<string, string[]>;
  createdAt: string;
  updatedAt: string;
}

export interface ISearchResponse {
  ok: boolean;
  query: string;
  results: ISearchResult[];
  total: number;
  counts: Record<DomainType, number>;
  page: number;
  size: number;
  took: number;
}

export interface ISuggestion {
  text: string;
  domainType: DomainType;
  docId: string;
}

export interface IBulkDocItem {
  id: string;
  doc: Record<string, unknown>;
}
