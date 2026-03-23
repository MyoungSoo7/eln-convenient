import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import redis, { invalidateSearchCache } from '../lib/redis';
import { createHttpLogger, AppError, ErrorCode, getOrgId } from '@lab/shared';
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

const { logger } = createHttpLogger('search-controller');

const SEARCH_CACHE_TTL = 180; // 3분

// ─── 권한 필터 ────────────────────────────────────────────
function buildPermissionFilter(userId: string, labId?: string, projectId?: string): object {
  const should: object[] = [
    { term: { ownerId: userId } },
    { term: { visibility: 'public' } },
  ];

  if (labId) {
    should.push({
      bool: {
        must: [
          { term: { labId } },
          { terms: { visibility: ['lab', 'public'] } },
        ],
      },
    });
  }
  if (projectId) {
    should.push({
      bool: {
        must: [
          { term: { projectId } },
          { terms: { visibility: ['project', 'lab', 'public'] } },
        ],
      },
    });
  }

  return {
    bool: {
      should,
      minimum_should_match: 1,
    },
  };
}

// ─── 통합 검색 ───────────────────────────────────────────

/** GET /api/search?q=...&domainTypes=NOTE,PROTOCOL&page=1&size=20 */
export async function search(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Record<string, string>;
  const q = query.q?.trim() || '';
  const domainTypesParam = query.domainTypes;
  const page = Math.max(1, parseInt(query.page) || 1);
  const size = Math.min(100, Math.max(1, parseInt(query.size) || 20));
  const fromOffset = (page - 1) * size;
  const dateFrom = query.dateFrom;
  const dateTo = query.dateTo;
  const userId = (request.headers['x-user-id'] as string)?.trim() || '';
  const labId = (request.headers['x-lab-id'] as string)?.trim() || '';
  const projectId = (request.headers['x-project-id'] as string)?.trim() || '';
  const orgId = getOrgId(request.headers);

  if (!q) {
    const emptyCounts = Object.fromEntries(DOMAIN_TYPES.map(t => [t, 0])) as Record<DomainType, number>;
    return { ok: true, query: q, results: [], total: 0, counts: emptyCounts, page, size, took: 0 };
  }

  const domainTypes = parseDomainTypes(domainTypesParam);

  // Redis 캐시 확인 (3분 TTL)
  const cacheParams = JSON.stringify({ q, domainTypes, page, size, dateFrom, dateTo, userId, orgId });
  const cacheKey = `cache:search:${createHash('sha256').update(cacheParams).digest('hex').slice(0, 16)}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch { /* Redis 오류 무시 */ }
  }

  try {
    const filters: object[] = [
      { term: { docStatus: 'active' } },
    ];

    filters.push({ term: { orgId } });

    if (userId) {
      filters.push(buildPermissionFilter(userId, labId || undefined, projectId || undefined));
    } else {
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
        data: { id: uuidv4(), userId, query: q, orgId },
      }).catch((err) => logger.warn({ err, userId, query: q }, '검색 히스토리 저장 실패'));
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

    // 결과가 있을 때만 캐싱 (3분 TTL)
    if (redis && results.length > 0) {
      try { await redis.set(cacheKey, JSON.stringify(responseBody), 'EX', SEARCH_CACHE_TTL); } catch { /* 무시 */ }
    }

    return responseBody;
  } catch (err) {
    logger.error({ err }, 'OpenSearch 검색 실패');
    throw new AppError(502, 'OpenSearch 검색에 실패했습니다.', ErrorCode.BAD_GATEWAY);
  }
}

/** GET /api/search/suggest?q=... */
export async function suggest(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Record<string, string>;
  const q = query.q?.trim() || '';
  const userId = (request.headers['x-user-id'] as string)?.trim() || '';
  const labId = (request.headers['x-lab-id'] as string)?.trim() || '';
  const projectId = (request.headers['x-project-id'] as string)?.trim() || '';
  const orgId = getOrgId(request.headers);

  if (!q) {
    return { ok: true, query: q, suggestions: [] };
  }

  try {
    const filters: object[] = [{ term: { docStatus: 'active' } }];

    filters.push({ term: { orgId } });

    if (userId) {
      filters.push(buildPermissionFilter(userId, labId || undefined, projectId || undefined));
    } else {
      filters.push({ term: { visibility: 'public' } });
    }

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
          filter: filters,
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

    return { ok: true, query: q, suggestions };
  } catch (err) {
    logger.error({ err }, '자동완성 검색 실패');
    return { ok: true, query: q, suggestions: [] };
  }
}

// ─── 색인 관리 (내부 서비스 전용) ────────────────────────

/** POST /api/search/index — 단일 문서 색인 */
export async function indexDoc(request: FastifyRequest, reply: FastifyReply) {
  const { id, doc } = request.body as any;
  try {
    await indexDocument(id, { ...doc, docStatus: doc.docStatus ?? 'active' });
    await invalidateSearchCache();
    return { ok: true, message: `${doc.domainType}:${id} 색인 완료` };
  } catch (err) {
    logger.error({ err }, '문서 색인 실패');
    throw new AppError(502, 'OpenSearch 색인에 실패했습니다.', ErrorCode.BAD_GATEWAY);
  }
}

/** POST /api/search/index/bulk — 벌크 색인 */
export async function bulkIndexDocs(request: FastifyRequest, reply: FastifyReply) {
  const { docs } = request.body as any;
  try {
    const result = await bulkIndexDocuments(docs);
    await invalidateSearchCache();
    return { ok: true, ...result };
  } catch (err) {
    logger.error({ err }, '벌크 색인 실패');
    throw new AppError(502, 'OpenSearch 벌크 색인에 실패했습니다.', ErrorCode.BAD_GATEWAY);
  }
}

/** DELETE /api/search/index/:id — 문서 소프트 삭제 */
export async function removeDoc(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    await softDeleteDocument(id);
    await invalidateSearchCache();
    return { ok: true, message: `${id} 소프트 삭제 완료` };
  } catch (err) {
    logger.error({ err }, '문서 삭제 실패');
    throw new AppError(502, 'OpenSearch 삭제에 실패했습니다.', ErrorCode.BAD_GATEWAY);
  }
}

/** GET /api/search/stats */
export async function statsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = await getIndexStats();
    return { ok: true, data };
  } catch (err) {
    logger.error({ err }, '통계 조회 실패');
    throw new AppError(502, 'OpenSearch 통계 조회에 실패했습니다.', ErrorCode.BAD_GATEWAY);
  }
}
