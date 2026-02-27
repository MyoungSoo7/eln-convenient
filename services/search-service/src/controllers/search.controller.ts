import { Request, Response } from 'express';
import { ISearchResult, ISuggestion } from '../interfaces/search.interface';

// TODO: OpenSearch 연동 — 현재는 더미 검색 결과 반환
const DUMMY_RESULTS: ISearchResult[] = [
  { id: 'note-001', type: 'note', title: 'PCR 최적화 실험', snippet: '...Taq Polymerase를 사용한 PCR 조건 최적화...', score: 0.95, highlight: { title: ['<em>PCR</em> 최적화 실험'] }, createdAt: '2024-01-15T09:00:00Z' },
  { id: 'tmpl-002', type: 'protocol', title: 'PCR 프로토콜', snippet: '...표준 PCR 프로토콜 템플릿...', score: 0.88, highlight: { title: ['<em>PCR</em> 프로토콜'] }, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'item-001', type: 'inventory', title: 'Taq DNA Polymerase', snippet: '...시약 / 효소 / A동 301호...', score: 0.72, highlight: { title: ['Taq DNA <em>Polymerase</em>'] }, createdAt: '2024-01-01T00:00:00Z' },
];

/** GET /api/search */
export function search(req: Request, res: Response): void {
  const q = (req.query.q as string) || '';
  const type = req.query.type as string;
  const page = parseInt(req.query.page as string) || 1;
  const size = parseInt(req.query.size as string) || 20;

  let results = DUMMY_RESULTS;
  if (q) results = results.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()) || r.snippet.toLowerCase().includes(q.toLowerCase()));
  if (type) results = results.filter((r) => type.split(',').includes(r.type));

  res.json({ query: q, results, total: results.length, page, size, took: 12 });
}

/** GET /api/search/suggest */
export function suggest(req: Request, res: Response): void {
  const q = (req.query.q as string) || '';
  const suggestions: ISuggestion[] = [
    { text: 'PCR 최적화', type: 'note', id: 'note-001' },
    { text: 'PCR 프로토콜', type: 'protocol', id: 'tmpl-002' },
    { text: 'Polymerase', type: 'inventory', id: 'item-001' },
  ].filter((s) => s.text.toLowerCase().includes(q.toLowerCase()));

  res.json({ query: q, suggestions });
}
