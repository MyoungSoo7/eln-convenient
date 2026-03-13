import { Request, Response } from 'express';
import { ISearchResult, ISuggestion } from '../interfaces/search.interface';
import { osClient, INDICES, indexDocument, deleteDocument } from '../lib/opensearch';

/** GET /api/search */
export async function search(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string) || '';
  const type = req.query.type as string;
  const page = parseInt(req.query.page as string) || 1;
  const size = parseInt(req.query.size as string) || 20;
  const from = (page - 1) * size;

  if (!q) {
    res.json({ query: q, results: [], total: 0, page, size, took: 0 });
    return;
  }

  // 검색 대상 인덱스 결정
  const indices: string[] = type
    ? type.split(',').map((t) => INDICES[t as keyof typeof INDICES]).filter(Boolean)
    : Object.values(INDICES);

  try {
    const body = {
      from,
      size,
      query: {
        multi_match: {
          query: q,
          fields: ['title^3', 'content', 'description', 'name^2', 'tags'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      },
      highlight: {
        fields: {
          title: {},
          content: { fragment_size: 150, number_of_fragments: 1 },
          name: {},
        },
      },
    };

    const response = await osClient.search({ index: indices.join(','), body });
    const hits = response.body.hits;

    const results: ISearchResult[] = hits.hits.map((hit: any) => ({
      id: hit._id,
      type: Object.entries(INDICES).find(([, v]) => v === hit._index)?.[0] || 'unknown',
      title: hit._source.title || hit._source.name || '',
      snippet: hit._source.content || hit._source.description || '',
      score: hit._score,
      highlight: hit.highlight || {},
      createdAt: hit._source.createdAt || '',
    }));

    res.json({
      query: q,
      results,
      total: hits.total.value ?? hits.total,
      page,
      size,
      took: response.body.took,
    });
  } catch (err) {
    console.error('[search-service] OpenSearch 검색 실패:', err);
    res.status(502).json({ error: 'OpenSearch 검색에 실패했습니다.' });
  }
}

/** GET /api/search/suggest */
export async function suggest(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string) || '';
  if (!q) { res.json({ query: q, suggestions: [] }); return; }

  try {
    const body = {
      size: 5,
      query: {
        multi_match: {
          query: q,
          fields: ['title^3', 'name^2'],
          type: 'phrase_prefix',
        },
      },
      _source: ['title', 'name'],
    };

    const response = await osClient.search({ index: Object.values(INDICES).join(','), body });
    const suggestions: ISuggestion[] = response.body.hits.hits.map((hit: any) => ({
      text: hit._source.title || hit._source.name || '',
      type: Object.entries(INDICES).find(([, v]) => v === hit._index)?.[0] || 'unknown',
      id: hit._id,
    }));

    res.json({ query: q, suggestions });
  } catch (err) {
    console.error('[search-service] suggest 실패:', err);
    res.json({ query: q, suggestions: [] });
  }
}

/** POST /api/search/index — 외부 서비스에서 문서 인덱싱 요청 */
export async function indexDoc(req: Request, res: Response): Promise<void> {
  const { type, id, doc } = req.body;
  if (!type || !id || !doc) {
    res.status(400).json({ error: 'type, id, doc 필드가 필요합니다.' });
    return;
  }
  const index = INDICES[type as keyof typeof INDICES];
  if (!index) {
    res.status(400).json({ error: `알 수 없는 타입: ${type}. 가능한 값: ${Object.keys(INDICES).join(', ')}` });
    return;
  }
  try {
    await indexDocument(index, id, doc);
    res.json({ ok: true, message: `${type}:${id} 인덱싱 완료` });
  } catch (err) {
    console.error('[search-service] 인덱싱 실패:', err);
    res.status(502).json({ error: 'OpenSearch 인덱싱에 실패했습니다.' });
  }
}

/** DELETE /api/search/index/:type/:id — 문서 삭제 */
export async function removeDoc(req: Request, res: Response): Promise<void> {
  const { type, id } = req.params;
  const index = INDICES[type as keyof typeof INDICES];
  if (!index) {
    res.status(400).json({ error: `알 수 없는 타입: ${type}` });
    return;
  }
  try {
    await deleteDocument(index, id);
    res.json({ ok: true, message: `${type}:${id} 인덱스 삭제 완료` });
  } catch (err) {
    console.error('[search-service] 인덱스 삭제 실패:', err);
    res.status(502).json({ error: 'OpenSearch 삭제에 실패했습니다.' });
  }
}
