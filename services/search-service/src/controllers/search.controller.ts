import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import type { ISearchResult, ISearchResponse, DomainType } from '../interfaces/search.interface';
import {
  osClient,
  UNIFIED_ALIAS,
  DOMAIN_TYPES,
  parseDomainTypes,
  indexDocument,
  softDeleteDocument,
  bulkIndexDocuments,
  getIndexStats,
} from '../lib/opensearch';

// ─── 권한 필터 ────────────────────────────────────────────
function buildPermissionFilter(userId: string): object {
  // MVP: ownerId 일치 OR visibility=public
  return {
    bool: {
      should: [
        { term: { ownerId: userId } },
        { term: { visibility: 'public' } },
      ],
      minimum_should_match: 1,
    },
  };
}

// ─── 통합 검색 ───────────────────────────────────────────

/** GET /api/search?q=...&domainTypes=NOTE,PROTOCOL&page=1&size=20 */
export async function search(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string)?.trim() || '';
  const domainTypesParam = req.query.domainTypes as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
  const fromOffset = (page - 1) * size;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const userId = (req.headers['x-user-id'] as string)?.trim() || '';

  if (!q) {
    const emptyCounts = Object.fromEntries(DOMAIN_TYPES.map(t => [t, 0])) as Record<DomainType, number>;
    res.json({ ok: true, query: q, results: [], total: 0, counts: emptyCounts, page, size, took: 0 });
    return;
  }

  const domainTypes = parseDomainTypes(domainTypesParam);

  try {
    const filters: object[] = [
      { term: { docStatus: 'active' } },
    ];

    if (userId) {
      filters.push(buildPermissionFilter(userId));
    } else {
      // Anonymous users see only public documents (MVP scope)
      filters.push({ term: { visibility: 'public' } });
    }

    if (domainTypes) {
      filters.push({ terms: { domainType: domainTypes } });
    }

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

    const body = {
      from: fromOffset,
      size,
      query: {
        bool: {
          must: {
            multi_match: {
              query: q,
              fields: ['title^4', 'tags^3', 'summary^2', 'content^1'],
              type: 'best_fields',
              fuzziness: 'AUTO',
            },
          },
          filter: filters,
        },
      },
      highlight: {
        fields: {
          title:   {},
          content: { fragment_size: 150, number_of_fragments: 1 },
          summary: { fragment_size: 150, number_of_fragments: 1 },
        },
        pre_tags: ['<em>'],
        post_tags: ['</em>'],
      },
      aggs: {
        by_domain: {
          terms: { field: 'domainType', size: 10 },
        },
      },
    };

    const response = await osClient.search({ index: UNIFIED_ALIAS, body });
    const hits = response.body.hits;

    const results: ISearchResult[] = hits.hits.map((hit: any) => ({
      docId: hit._id,
      domainType: hit._source.domainType as DomainType,
      title: hit._source.title || '',
      snippet: hit._source.summary || hit._source.content || '',
      score: hit._score,
      highlight: hit.highlight || {},
      createdAt: hit._source.createdAt || '',
      updatedAt: hit._source.updatedAt || '',
    }));

    const buckets: Array<{ key: string; doc_count: number }> =
      response.body.aggregations?.by_domain?.buckets ?? [];
    const counts = Object.fromEntries(DOMAIN_TYPES.map(t => [t, 0])) as Record<DomainType, number>;
    for (const bucket of buckets) {
      if (bucket.key in counts) {
        counts[bucket.key as DomainType] = bucket.doc_count;
      }
    }

    if (userId) {
      prisma.searchHistory.create({
        data: { id: uuidv4(), userId, query: q },
      }).catch((err) => console.warn('[search] 히스토리 저장 실패 (무시):', err));
    }

    const responseBody: ISearchResponse = {
      ok: true,
      query: q,
      results,
      total: hits.total.value ?? hits.total,
      counts,
      page,
      size,
      took: response.body.took,
    };
    res.json(responseBody);
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
        bool: {
          must: {
            multi_match: {
              query: q,
              fields: ['title^3', 'tags^2'],
              type: 'phrase_prefix',
            },
          },
          filter: [{ term: { docStatus: 'active' } }],
        },
      },
      _source: ['title', 'domainType'],
    };

    const response = await osClient.search({ index: UNIFIED_ALIAS, body });
    const suggestions = response.body.hits.hits.map((hit: any) => ({
      text: hit._source.title || '',
      domainType: (hit._source.domainType || 'NOTE') as DomainType,
      docId: hit._id,
    }));

    res.json({ ok: true, query: q, suggestions });
  } catch (err) {
    console.error('[suggest] 실패:', err);
    res.json({ ok: true, query: q, suggestions: [] });
  }
}

// ─── 색인 관리 (내부 서비스 전용) ────────────────────────

/** POST /api/search/index — 단일 문서 색인 */
export async function indexDoc(req: Request, res: Response): Promise<void> {
  const { id, doc } = req.body;
  try {
    await indexDocument(id, { ...doc, docStatus: doc.docStatus ?? 'active' });
    res.json({ ok: true, message: `${doc.domainType}:${id} 색인 완료` });
  } catch (err) {
    console.error('[indexDoc] 색인 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 색인에 실패했습니다.' });
  }
}

/** POST /api/search/index/bulk — 벌크 색인 */
export async function bulkIndexDocs(req: Request, res: Response): Promise<void> {
  const { docs } = req.body;
  try {
    const result = await bulkIndexDocuments(docs);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[bulkIndexDocs] 벌크 색인 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 벌크 색인에 실패했습니다.' });
  }
}

/** DELETE /api/search/index/:id — 문서 소프트 삭제 */
export async function removeDoc(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    await softDeleteDocument(id);
    res.json({ ok: true, message: `${id} 소프트 삭제 완료` });
  } catch (err) {
    console.error('[removeDoc] 삭제 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 삭제에 실패했습니다.' });
  }
}

/** GET /api/search/stats */
export async function statsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getIndexStats();
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[stats] 통계 조회 실패:', err);
    res.status(502).json({ ok: false, error: 'OpenSearch 통계 조회에 실패했습니다.' });
  }
}
