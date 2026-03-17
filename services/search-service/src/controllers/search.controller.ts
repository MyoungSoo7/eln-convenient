import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { ISearchResult, ISuggestion } from '../interfaces/search.interface';
import {
  osClient, INDICES, IndexKey,
  resolveIndices, indexToType,
  indexDocument, deleteDocument,
  bulkIndexDocuments, getIndexStats,
  TYPE_ALIASES,
} from '../lib/opensearch';

// ─────────────────────────────────────────────
// 검색
// ─────────────────────────────────────────────

/** GET /api/search?q=...&type=notes,inventory&page=1&size=20&from=&to=&authorId= */
export async function search(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string)?.trim() || '';
  const type = req.query.type as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
  const fromOffset = (page - 1) * size;
  const dateFrom = req.query.from as string | undefined;
  const dateTo = req.query.to as string | undefined;
  const authorId = req.query.authorId as string | undefined;

  if (!q) {
    res.json({ ok: true, query: q, results: [], total: 0, page, size, took: 0 });
    return;
  }

  const indices = resolveIndices(type);
  if (indices.length === 0) {
    res.status(400).json({
      ok: false,
      error: `알 수 없는 type: ${type}. 가능한 값: ${Object.keys(TYPE_ALIASES).join(', ')}`,
    });
    return;
  }

  try {
    // 필터 조건 조립
    const filters: object[] = [];
    if (dateFrom || dateTo) {
      filters.push({
        range: {
          createdAt: {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
          },
        },
      });
    }
    if (authorId) {
      filters.push({ term: { authorId } });
    }

    const multiMatch = {
      multi_match: {
        query: q,
        fields: ['title^3', 'content', 'description', 'name^2', 'tags'],
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    };

    const queryBody = filters.length > 0
      ? { bool: { must: multiMatch, filter: filters } }
      : multiMatch;

    const body = {
      from: fromOffset,
      size,
      query: queryBody,
      highlight: {
        fields: {
          title:       {},
          content:     { fragment_size: 150, number_of_fragments: 1 },
          name:        {},
          description: { fragment_size: 150, number_of_fragments: 1 },
        },
      },
    };

    const response = await osClient.search({ index: indices.join(','), body });
    const hits = response.body.hits;

    const results: ISearchResult[] = hits.hits.map((hit: any) => ({
      id: hit._id,
      type: indexToType(hit._index),
      title: hit._source.title || hit._source.name || '',
      snippet: hit._source.content || hit._source.description || hit._source.location || '',
      score: hit._score,
      highlight: hit.highlight || {},
      createdAt: hit._source.createdAt || '',
    }));

    // 검색어 히스토리 자동 저장 (비동기, 실패해도 검색 결과에 영향 없음)
    const userId = req.headers['x-user-id'] as string;
    if (userId) {
      prisma.searchHistory.create({
        data: { id: uuidv4(), userId, query: q },
      }).catch(() => { /* 무시 */ });
    }

    res.json({
      ok: true,
      query: q,
      results,
      total: hits.total.value ?? hits.total,
      page,
      size,
      took: response.body.took,
    });
  } catch (err) {
    console.error('[search] OpenSearch 검색 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 검색에 실패했습니다.' });
  }
}

/** GET /api/search/suggest?q=... */
export async function suggest(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string)?.trim() || '';
  if (!q) {
    res.json({ ok: true, query: q, suggestions: [] });
    return;
  }

  try {
    const body = {
      size: 7,
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
      type: indexToType(hit._index),
      id: hit._id,
    }));

    res.json({ ok: true, query: q, suggestions });
  } catch (err) {
    console.error('[suggest] 실패:', err);
    res.json({ ok: true, query: q, suggestions: [] });
  }
}

// ─────────────────────────────────────────────
// 인덱스 관리 (내부 서비스 전용 — x-internal-secret 필요)
// ─────────────────────────────────────────────

/** POST /api/search/index — 단일 문서 인덱싱 */
export async function indexDoc(req: Request, res: Response): Promise<void> {
  const { type, id, doc } = req.body;
  if (!type || !id || !doc) {
    res.status(400).json({ ok: false, error: 'type, id, doc 필드가 필요합니다.' });
    return;
  }
  const key = TYPE_ALIASES[type as string] as IndexKey | undefined;
  if (!key) {
    res.status(400).json({
      ok: false,
      error: `알 수 없는 type: ${type}. 가능한 값: ${Object.keys(TYPE_ALIASES).join(', ')}`,
    });
    return;
  }
  try {
    await indexDocument(INDICES[key], id, doc);
    res.json({ ok: true, message: `${type}:${id} 인덱싱 완료` });
  } catch (err) {
    console.error('[indexDoc] 인덱싱 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 인덱싱에 실패했습니다.' });
  }
}

/** POST /api/search/index/bulk — 벌크 인덱싱 */
export async function bulkIndexDocs(req: Request, res: Response): Promise<void> {
  const { type, docs } = req.body;
  if (!type || !Array.isArray(docs) || docs.length === 0) {
    res.status(400).json({ ok: false, error: 'type과 docs(배열) 필드가 필요합니다.' });
    return;
  }
  const key = TYPE_ALIASES[type as string] as IndexKey | undefined;
  if (!key) {
    res.status(400).json({ ok: false, error: `알 수 없는 type: ${type}` });
    return;
  }
  for (const item of docs) {
    if (!item.id || !item.doc) {
      res.status(400).json({ ok: false, error: 'docs 배열의 각 항목은 { id, doc } 형태여야 합니다.' });
      return;
    }
  }

  try {
    const result = await bulkIndexDocuments(INDICES[key], docs);
    res.json({ ok: true, type, ...result });
  } catch (err) {
    console.error('[bulkIndexDocs] 벌크 인덱싱 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 벌크 인덱싱에 실패했습니다.' });
  }
}

/** DELETE /api/search/index/:type/:id — 문서 삭제 */
export async function removeDoc(req: Request, res: Response): Promise<void> {
  const { type, id } = req.params;
  const key = TYPE_ALIASES[type] as IndexKey | undefined;
  if (!key) {
    res.status(400).json({ ok: false, error: `알 수 없는 type: ${type}` });
    return;
  }
  try {
    await deleteDocument(INDICES[key], id);
    res.json({ ok: true, message: `${type}:${id} 인덱스 삭제 완료` });
  } catch (err) {
    console.error('[removeDoc] 삭제 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 삭제에 실패했습니다.' });
  }
}

/** GET /api/search/stats — 인덱스 통계 (내부 전용) */
export async function statsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getIndexStats();
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[stats] 통계 조회 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 통계 조회에 실패했습니다.' });
  }
}
