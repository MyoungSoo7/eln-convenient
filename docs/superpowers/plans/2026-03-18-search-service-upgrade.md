# search-service 통합검색 업그레이드 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 3-인덱스 search-service를 unified index + domainType 구조로 업그레이드하고, 도메인 서비스(eln/inventory) 색인 연동, 권한 필터링, 타입별 카운트, 검색어 즐겨찾기를 구현한다.

**Architecture:**
- OpenSearch 통합 인덱스 `lab_search_v1` (domainType: NOTE/PROTOCOL/TEMPLATE/INVENTORY) + alias `lab_search`
- eln-service/inventory-service → HTTP POST로 search-service `/api/search/index` 호출 (fire-and-forget)
- 권한: `ownerId` 또는 `visibility=public` 기반 filter (MVP scope, labId 확장 가능)

**Tech Stack:** Express + TypeScript, @opensearch-project/opensearch, Prisma + PostgreSQL, UUID

---

## 현재 상태 (파악 완료)

| 항목 | 현재 | 목표 |
|------|------|------|
| 인덱스 | 3개 분리 (labnote-notes/templates/inventory) | 통합 `lab_search_v1` |
| 프로토콜 | templates 인덱스에 혼재 | PROTOCOL domainType 분리 |
| 권한 필터 | 없음 (authorId만) | ownerId/visibility 기반 |
| 타입별 카운트 | 없음 | aggregation 포함 |
| 도메인 연동 | 없음 | eln-service/inventory-service → search |
| 검색어 즐겨찾기 | 없음 (문서 즐겨찾기만 있음) | SearchKeywordFavorite 모델 추가 |

---

## 파일 구조

### search-service (수정)
- `src/lib/opensearch.ts` — 통합 인덱스 `lab_search_v1` 매핑, alias 관리
- `src/interfaces/search.interface.ts` — domainType, UnifiedDoc, 응답 타입
- `src/controllers/search.controller.ts` — domainTypes 파라미터, permission filter, counts aggregation
- `src/controllers/keyword-favorites.controller.ts` (NEW) — 검색어 즐겨찾기 CRUD
- `src/routes/search.routes.ts` — 키워드 즐겨찾기 라우트 추가
- `prisma/schema.prisma` — SearchKeywordFavorite 모델 추가
- `src/openapi/search.openapi.ts` — API 스펙 업데이트

### eln-service (수정)
- `src/lib/searchClient.ts` (NEW) — search-service HTTP 클라이언트
- `src/controllers/note.controller.ts` — createNote/updateNote/deleteNote 후 색인 호출
- `src/controllers/template.controller.ts` — createTemplate/updateTemplate/deleteTemplate 후 색인 호출

### inventory-service (수정)
- `src/lib/searchClient.ts` (NEW) — search-service HTTP 클라이언트
- `src/controllers/inventory.controller.ts` — createItem/updateItem/deleteItem 후 색인 호출

### 인프라
- `services/docker-compose.yml` — eln-service/inventory-service에 `SEARCH_SERVICE_URL` 추가

---

## Task 1: 통합 인덱스 매핑 교체 (opensearch.ts)

**Files:**
- Modify: `services/search-service/src/lib/opensearch.ts`
- Modify: `services/search-service/src/interfaces/search.interface.ts`

- [ ] **Step 1: 인터페이스 업데이트**

`DomainType`의 canonical 정의는 `search.interface.ts`에만 두고, `opensearch.ts`는 이를 re-export한다.

```typescript
// services/search-service/src/interfaces/search.interface.ts
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
```

- [ ] **Step 2: opensearch.ts — 통합 인덱스로 교체**

기존 `INDICES` 맵과 3개 매핑을 제거하고 통합 인덱스 구조로 교체:

```typescript
// services/search-service/src/lib/opensearch.ts
import { Client } from '@opensearch-project/opensearch';

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://localhost:9200';

export const osClient = new Client({ node: OPENSEARCH_URL });

export const UNIFIED_INDEX = 'lab_search_v1';
export const UNIFIED_ALIAS = 'lab_search';

// DomainType은 search.interface.ts에서 정의 — 여기서는 re-export만
export type { DomainType } from '../interfaces/search.interface';
import type { DomainType } from '../interfaces/search.interface';

export const DOMAIN_TYPES: DomainType[] = ['NOTE', 'PROTOCOL', 'TEMPLATE', 'INVENTORY'];

/** 외부 type 파라미터 → DomainType[] 변환 */
export function parseDomainTypes(param?: string): DomainType[] | undefined {
  if (!param) return undefined;
  const valid = new Set<string>(DOMAIN_TYPES);
  const parsed = param.toUpperCase().split(',')
    .map(t => t.trim())
    .filter(t => valid.has(t)) as DomainType[];
  return parsed.length > 0 ? parsed : undefined;
}

const unifiedMapping = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        default_analyzer: {
          type: 'standard',
        },
      },
    },
  },
  mappings: {
    properties: {
      docId:       { type: 'keyword' },
      domainType:  { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'standard',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      content:   { type: 'text', analyzer: 'standard' },
      summary:   { type: 'text', analyzer: 'standard' },
      tags: {
        type: 'text',
        analyzer: 'standard',
        fields: { keyword: { type: 'keyword' } },
      },
      ownerId:    { type: 'keyword' },
      labId:      { type: 'keyword' },
      projectId:  { type: 'keyword' },
      visibility: { type: 'keyword' },
      docStatus:  { type: 'keyword' },
      createdAt:  { type: 'date' },
      updatedAt:  { type: 'date' },
    },
  },
};

export async function ensureIndices(): Promise<void> {
  try {
    const exists = await osClient.indices.exists({ index: UNIFIED_INDEX });
    if (!exists.body) {
      await osClient.indices.create({ index: UNIFIED_INDEX, body: unifiedMapping });
      console.log(`[search-service] 인덱스 생성: ${UNIFIED_INDEX}`);
    }
    // alias 설정 (없을 때만)
    try {
      await osClient.indices.putAlias({ index: UNIFIED_INDEX, name: UNIFIED_ALIAS });
      console.log(`[search-service] alias 설정: ${UNIFIED_ALIAS} → ${UNIFIED_INDEX}`);
    } catch {
      // alias 이미 존재하면 무시
    }
  } catch (err) {
    console.error(`[search-service] 인덱스 초기화 실패:`, err);
  }
}

export async function indexDocument(id: string, doc: Record<string, unknown>): Promise<void> {
  await osClient.index({
    index: UNIFIED_ALIAS,
    id,
    body: doc,
    refresh: 'wait_for',
  });
}

export async function softDeleteDocument(id: string): Promise<void> {
  try {
    await osClient.update({
      index: UNIFIED_ALIAS,
      id,
      body: { doc: { docStatus: 'deleted', updatedAt: new Date().toISOString() } },
      refresh: 'wait_for',
    });
  } catch {
    // 없는 문서는 무시
  }
}

export async function deleteDocument(id: string): Promise<void> {
  try {
    await osClient.delete({ index: UNIFIED_ALIAS, id });
  } catch {
    // 없는 문서는 무시
  }
}

export async function bulkIndexDocuments(
  docs: Array<{ id: string; doc: Record<string, unknown> }>
): Promise<{ indexed: number; errors: number }> {
  if (docs.length === 0) return { indexed: 0, errors: 0 };

  const body = docs.flatMap(({ id, doc }) => [
    { index: { _index: UNIFIED_INDEX, _id: id } },
    doc,
  ]);

  const response = await osClient.bulk({ body, refresh: 'wait_for' });
  const items = response.body.items as Array<{ index: { error?: unknown } }>;
  const errors = items.filter((item) => item.index?.error).length;
  return { indexed: docs.length - errors, errors };
}

export async function getIndexStats(): Promise<{ count: number; size: string }> {
  try {
    const countRes = await osClient.count({ index: UNIFIED_ALIAS });
    const statsRes = await osClient.indices.stats({ index: UNIFIED_INDEX });
    const sizeBytes: number = statsRes.body._all?.total?.store?.size_in_bytes ?? 0;
    return {
      count: countRes.body.count,
      size: `${(sizeBytes / 1024).toFixed(1)} KB`,
    };
  } catch {
    return { count: 0, size: '0 KB' };
  }
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd services/search-service && npx tsc --noEmit 2>&1 | head -30
```

Expected: 타입 에러가 있으면 수정 (search.controller.ts가 구 INDICES 참조하므로 다음 Task에서 함께 수정)

---

## Task 2: 검색 컨트롤러 업그레이드

**Files:**
- Modify: `services/search-service/src/controllers/search.controller.ts`

- [ ] **Step 1: search.controller.ts 전면 교체**

기존 `INDICES`, `TYPE_ALIASES`, `indexToType` 참조를 제거하고 통합 인덱스 방식으로 교체:

```typescript
// services/search-service/src/controllers/search.controller.ts
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
function buildPermissionFilter(userId: string, _labIds: string[]): object {
  // MVP: ownerId 일치 OR visibility=public
  // 향후 labId 기반 확장: { term: { labId: labId } } 추가
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
    // ── 필터 조립 ──
    const filters: object[] = [
      { term: { docStatus: 'active' } },
    ];

    if (userId) {
      filters.push(buildPermissionFilter(userId, []));
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

    // aggregation → counts
    const buckets: Array<{ key: string; doc_count: number }> =
      response.body.aggregations?.by_domain?.buckets ?? [];
    const counts = Object.fromEntries(DOMAIN_TYPES.map(t => [t, 0])) as Record<DomainType, number>;
    for (const bucket of buckets) {
      if (bucket.key in counts) {
        counts[bucket.key as DomainType] = bucket.doc_count;
      }
    }

    // 히스토리 비동기 저장
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
      domainType: hit._source.domainType || 'NOTE',
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
  if (!id || !doc) {
    res.status(400).json({ ok: false, error: 'id, doc 필드가 필요합니다.' });
    return;
  }
  if (!doc.domainType || !DOMAIN_TYPES.includes(doc.domainType)) {
    res.status(400).json({
      ok: false,
      error: `doc.domainType은 ${DOMAIN_TYPES.join('|')} 중 하나여야 합니다.`,
    });
    return;
  }
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
  if (!Array.isArray(docs) || docs.length === 0) {
    res.status(400).json({ ok: false, error: 'docs(배열) 필드가 필요합니다.' });
    return;
  }
  for (const item of docs) {
    if (!item.id || !item.doc) {
      res.status(400).json({ ok: false, error: 'docs 배열의 각 항목은 { id, doc } 형태여야 합니다.' });
      return;
    }
  }
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
```

- [ ] **Step 2: 라우트 업데이트 (색인 삭제 경로 단순화)**

`search.routes.ts`에서 기존 `router.delete('/index/:type/:id', ...)` 라인을 **제거**하고 아래로 교체:

```typescript
// services/search-service/src/routes/search.routes.ts
// 기존 라인 삭제: router.delete('/index/:type/:id', requireInternalSecret, ctrl.removeDoc);
// 아래 라인으로 교체:
router.delete('/index/:id', requireInternalSecret, ctrl.removeDoc);
```

- [ ] **Step 3: 빌드 확인**

```bash
cd services/search-service && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors

---

## Task 3: Prisma — SearchKeywordFavorite 모델 추가

**Files:**
- Modify: `services/search-service/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma에 모델 추가**

기존 `Favorite` 모델 아래에 추가:

```prisma
model SearchKeywordFavorite {
  id        String   @id @default(uuid())
  userId    String
  keyword   String
  createdAt DateTime @default(now())

  @@unique([userId, keyword])
  @@index([userId])
}
```

- [ ] **Step 2: Prisma 마이그레이션**

```bash
cd services/search-service && npx prisma db push --skip-generate 2>&1 | tail -5
```

Expected: `Your database is now in sync with your Prisma schema`

참고: DB가 실행 중이어야 함. Docker 환경에서는 컨테이너 내에서 실행.
프로덕션 배포 전에는 `npx prisma migrate dev --name add_search_keyword_favorite`으로 마이그레이션 파일 생성 필요.

- [ ] **Step 3: Prisma 클라이언트 재생성**

```bash
cd services/search-service && npx prisma generate
```

---

## Task 4: 검색어 즐겨찾기 컨트롤러 + 라우트

**Files:**
- Create: `services/search-service/src/controllers/keyword-favorites.controller.ts`
- Modify: `services/search-service/src/routes/search.routes.ts`

- [ ] **Step 1: keyword-favorites.controller.ts 생성**

```typescript
// services/search-service/src/controllers/keyword-favorites.controller.ts
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

/** POST /api/search/keyword-favorites */
export async function addKeywordFavorite(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string)?.trim();
  const { keyword } = req.body;

  if (!keyword?.trim()) {
    res.status(400).json({ ok: false, error: 'keyword는 필수입니다.' });
    return;
  }

  try {
    const fav = await prisma.searchKeywordFavorite.create({
      data: { id: uuidv4(), userId, keyword: keyword.trim() },
    });
    res.status(201).json({ ok: true, data: fav });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 즐겨찾기에 추가된 검색어입니다.' });
      return;
    }
    console.error('[addKeywordFavorite]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 추가 중 오류가 발생했습니다.' });
  }
}

/** GET /api/search/keyword-favorites */
export async function getKeywordFavorites(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string)?.trim();

  try {
    const favorites = await prisma.searchKeywordFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, data: favorites, total: favorites.length });
  } catch (err) {
    console.error('[getKeywordFavorites]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 조회 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/search/keyword-favorites/:id */
export async function removeKeywordFavorite(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string)?.trim();

  try {
    const fav = await prisma.searchKeywordFavorite.findUnique({ where: { id: req.params.id } });
    if (!fav) {
      res.status(404).json({ ok: false, error: '즐겨찾기를 찾을 수 없습니다.' });
      return;
    }
    if (fav.userId !== userId) {
      res.status(403).json({ ok: false, error: '본인의 즐겨찾기만 삭제할 수 있습니다.' });
      return;
    }
    await prisma.searchKeywordFavorite.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '즐겨찾기 검색어가 삭제되었습니다.', id: req.params.id });
  } catch (err) {
    console.error('[removeKeywordFavorite]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 삭제 중 오류가 발생했습니다.' });
  }
}
```

- [ ] **Step 2: routes에 키워드 즐겨찾기 라우트 추가**

`search.routes.ts`에서 즐겨찾기 섹션 아래에 추가:

```typescript
import * as keywordFavCtrl from '../controllers/keyword-favorites.controller';

// ── 검색어 즐겨찾기 ─────────────────────────────────────
router.post('/keyword-favorites',       requireAuth, keywordFavCtrl.addKeywordFavorite);
router.get('/keyword-favorites',        requireAuth, keywordFavCtrl.getKeywordFavorites);
router.delete('/keyword-favorites/:id', requireAuth, keywordFavCtrl.removeKeywordFavorite);
```

- [ ] **Step 3: 빌드 확인**

```bash
cd services/search-service && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
cd services/search-service
git add src/lib/opensearch.ts src/interfaces/search.interface.ts src/controllers/search.controller.ts src/controllers/keyword-favorites.controller.ts src/routes/search.routes.ts prisma/schema.prisma
git commit -m "feat(search): unified index, domainType, permission filter, counts, keyword-favorites"
```

---

## Task 5: eln-service 검색 클라이언트 + 색인 연동

**Files:**
- Create: `services/eln-service/src/lib/searchClient.ts`
- Modify: `services/eln-service/src/controllers/note.controller.ts`
- Modify: `services/eln-service/src/controllers/template.controller.ts`

- [ ] **Step 1: searchClient.ts 생성**

```typescript
// services/eln-service/src/lib/searchClient.ts
import http from 'http';
import https from 'https';

const SEARCH_SERVICE_URL = process.env.SEARCH_SERVICE_URL || 'http://localhost:8006';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'dev-internal-secret';

interface IndexPayload {
  id: string;
  doc: Record<string, unknown>;
}

function postJSON(url: string, body: unknown): Promise<void> {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-internal-secret': INTERNAL_SECRET,
        },
      },
      (res) => {
        res.resume(); // consume response
        resolve();
      },
    );
    req.on('error', (err) => {
      console.warn('[searchClient] 색인 실패 (무시):', err.message);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

function deleteDoc(id: string): Promise<void> {
  return new Promise((resolve) => {
    const parsed = new URL(`${SEARCH_SERVICE_URL}/api/search/index/${id}`);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname,
        method: 'DELETE',
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      },
      (res) => { res.resume(); resolve(); },
    );
    req.on('error', (err) => {
      console.warn('[searchClient] 삭제 실패 (무시):', err.message);
      resolve();
    });
    req.end();
  });
}

export const searchClient = {
  index(payload: IndexPayload): void {
    postJSON(`${SEARCH_SERVICE_URL}/api/search/index`, payload)
      .catch((err) => console.warn('[searchClient] index 실패:', err));
  },
  delete(id: string): void {
    deleteDoc(id)
      .catch((err) => console.warn('[searchClient] delete 실패:', err));
  },
};
```

- [ ] **Step 2: note.controller.ts — createNote에 색인 추가**

`createNote` 함수에서 `callAuditLog(...)` 호출 블록의 catch 닫는 괄호 바로 다음, `res.status(201).json(...)` 직전 라인에 추가:
(주의: `note.controller.ts`에는 `createTemplate` 함수가 있을 수 있으나, **이 파일의 `createTemplate`은 수정하지 않는다** — template 색인은 `template.controller.ts`에서만 처리)

```typescript
// 상단 import에 추가
import { searchClient } from '../lib/searchClient';

// createNote: note 생성 후, res.status(201) 직전에 추가
searchClient.index({
  id: note.id,
  doc: {
    domainType: note.type === 'protocol' ? 'PROTOCOL' : 'NOTE',
    title: note.title,
    content: note.content,
    tags: note.tags,
    ownerId: note.authorId,
    visibility: 'private',
    docStatus: 'active',
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  },
});
```

- [ ] **Step 3: note.controller.ts — updateNote에 색인 추가**

`updateNote` 함수에서 `res.json({ ok: true, data: updated })` 직전에 추가:

```typescript
searchClient.index({
  id: updated.id,
  doc: {
    domainType: updated.type === 'protocol' ? 'PROTOCOL' : 'NOTE',
    title: updated.title,
    content: updated.content,
    tags: updated.tags,
    ownerId: updated.authorId,
    visibility: 'private',
    docStatus: 'active',
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  },
});
```

- [ ] **Step 4: note.controller.ts — deleteNote에 소프트 삭제 추가**

`deleteNote` 함수에서 `prisma.note.delete(...)` 이후에 추가:

```typescript
searchClient.delete(req.params.id);
```

- [ ] **Step 5: template.controller.ts — createTemplate에 색인 추가**

`createTemplate` 함수에서 `res.status(201).json(...)` 직전에 추가:

```typescript
import { searchClient } from '../lib/searchClient';

searchClient.index({
  id: tmpl.id,
  doc: {
    domainType: 'TEMPLATE',
    title: tmpl.title,
    content: tmpl.content,
    summary: tmpl.description,
    tags: tmpl.tags,
    ownerId: tmpl.createdBy,
    visibility: tmpl.isPublic ? 'public' : 'private',
    docStatus: 'active',
    createdAt: tmpl.createdAt.toISOString(),
    updatedAt: tmpl.updatedAt.toISOString(),
  },
});
```

- [ ] **Step 6: template.controller.ts — updateTemplate/deleteTemplate에 색인 추가**

`updateTemplate`의 `res.json(...)` 직전:

```typescript
searchClient.index({
  id: updated.id,
  doc: {
    domainType: 'TEMPLATE',
    title: updated.title,
    content: updated.content,
    summary: updated.description,
    tags: updated.tags,
    ownerId: updated.createdBy,
    visibility: updated.isPublic ? 'public' : 'private',
    docStatus: 'active',
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  },
});
```

`deleteTemplate`의 `prisma.template.delete(...)` 이후:

```typescript
searchClient.delete(req.params.id);
```

- [ ] **Step 7: eln-service 빌드 확인**

```bash
cd services/eln-service && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
cd services/eln-service
git add src/lib/searchClient.ts src/controllers/note.controller.ts src/controllers/template.controller.ts
git commit -m "feat(eln): search-service 색인 연동 (note/protocol/template CRUD)"
```

---

## Task 6: inventory-service 검색 클라이언트 + 색인 연동

**Files:**
- Create: `services/inventory-service/src/lib/searchClient.ts`
- Modify: `services/inventory-service/src/controllers/inventory.controller.ts`

- [ ] **Step 1: searchClient.ts 생성**

eln-service의 `src/lib/searchClient.ts`와 동일한 내용으로 생성:

```typescript
// services/inventory-service/src/lib/searchClient.ts
// (eln-service/src/lib/searchClient.ts와 동일 내용)
```

- [ ] **Step 2: inventory.controller.ts — createItem 색인 추가**

`createItem` 함수에서 `res.status(201).json(...)` 직전에 추가:

```typescript
import { searchClient } from '../lib/searchClient';

searchClient.index({
  id: item.id,
  doc: {
    domainType: 'INVENTORY',
    title: item.name,
    tags: item.tags,
    ownerId: item.createdBy,
    visibility: 'private',
    docStatus: 'active',
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  },
});
```

- [ ] **Step 3: inventory.controller.ts — updateItem 색인 추가**

`updateItem` 함수에서 `prisma.inventoryItem.update(...)` 결과를 받는 변수명을 확인한다.
실제 코드에서 변수명은 `item` (not `updated`)이므로 아래와 같이 작성:

```typescript
searchClient.index({
  id: item.id,
  doc: {
    domainType: 'INVENTORY',
    title: item.name,
    tags: item.tags,
    ownerId: item.createdBy,
    visibility: 'private',
    docStatus: 'active',
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  },
});
```

- [ ] **Step 4: inventory.controller.ts — deleteItem 소프트 삭제**

deleteItem 함수에서 `prisma.inventoryItem.delete(...)` 이후에 추가:

```typescript
searchClient.delete(req.params.id);
```

먼저 deleteItem 함수가 있는지 확인:

```bash
grep -n "deleteItem\|export async function delete" services/inventory-service/src/controllers/inventory.controller.ts
```

삭제 함수가 없다면 이 단계는 skip.

- [ ] **Step 5: inventory-service 빌드 확인**

```bash
cd services/inventory-service && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
cd services/inventory-service
git add src/lib/searchClient.ts src/controllers/inventory.controller.ts
git commit -m "feat(inventory): search-service 색인 연동 (INVENTORY CRUD)"
```

---

## Task 7: docker-compose.yml — 환경변수 추가

**Files:**
- Modify: `services/docker-compose.yml`

- [ ] **Step 1: eln-service에 SEARCH_SERVICE_URL 추가**

`eln-service` environment 블록에 추가 (`INTERNAL_SECRET`은 이미 있으므로 추가 불필요):

```yaml
- SEARCH_SERVICE_URL=http://search-service:8006
```

- [ ] **Step 2: inventory-service에 SEARCH_SERVICE_URL + INTERNAL_SECRET 추가**

`inventory-service` environment 블록에 추가:

```yaml
- SEARCH_SERVICE_URL=http://search-service:8006
- INTERNAL_SECRET=${INTERNAL_SECRET:-}
```

- [ ] **Step 3: eln-service/inventory-service에 search-service depends_on 추가**

색인은 fire-and-forget이므로 search-service 미기동 시에도 도메인 서비스는 정상 동작해야 한다.
`service_healthy` 대신 `service_started`를 사용하여 하드 의존성을 만들지 않는다:

```yaml
# eln-service depends_on에 추가
  search-service:
    condition: service_started

# inventory-service depends_on에도 동일하게 추가
  search-service:
    condition: service_started
```

- [ ] **Step 4: Commit**

```bash
git add services/docker-compose.yml
git commit -m "chore: eln/inventory에 SEARCH_SERVICE_URL 환경변수 추가"
```

---

## Task 8: 최종 통합 검증

- [ ] **Step 1: 전체 빌드 확인**

```bash
cd services/search-service && npx tsc --noEmit && echo "search-service OK" && \
cd ../eln-service && npx tsc --noEmit && echo "eln-service OK" && \
cd ../inventory-service && npx tsc --noEmit && echo "inventory-service OK"
```

Expected: 각 서비스 "OK"

- [ ] **Step 2: Docker 서비스 기동 (선택)**

```bash
cd services && docker-compose up -d opensearch postgres redis search-service
```

- [ ] **Step 3: 인덱스 생성 확인**

```bash
curl -s http://localhost:9200/lab_search_v1/_mapping | python -m json.tool 2>/dev/null | head -30
```

Expected: domainType, title, content, tags, ownerId, visibility, docStatus 필드 존재

- [ ] **Step 4: 검색 API 스모크 테스트**

```bash
# 검색 (인증 없이 → 401)
curl -s http://localhost:8006/api/search?q=test

# 인증 포함 검색
# requirePermission('note:read')를 통과하려면 x-user-permissions 헤더에 note:read 또는 * 포함 필요
curl -s -H "x-user-id: test-user" \
     -H 'x-user-permissions: ["note:read"]' \
     "http://localhost:8006/api/search?q=test" | python -m json.tool
```

Expected: `{ ok: true, results: [], counts: { NOTE: 0, PROTOCOL: 0, TEMPLATE: 0, INVENTORY: 0 }, ... }`

- [ ] **Step 5: 색인 스모크 테스트**

```bash
curl -s -X POST http://localhost:8006/api/search/index \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: dev-internal-secret" \
  -d '{"id":"test-note-1","doc":{"domainType":"NOTE","title":"CRISPR 실험","content":"실험 내용","tags":["CRISPR"],"ownerId":"test-user","visibility":"public","docStatus":"active","createdAt":"2026-03-18T00:00:00Z","updatedAt":"2026-03-18T00:00:00Z"}}'
```

Expected: `{ ok: true, message: "NOTE:test-note-1 색인 완료" }`

- [ ] **Step 6: 검색 결과 확인**

```bash
curl -s -H "x-user-id: test-user" -H 'x-user-permissions: ["note:read"]' \
  "http://localhost:8006/api/search?q=CRISPR" | python -m json.tool
```

Expected: results에 "CRISPR 실험" 문서 포함, counts.NOTE = 1

- [ ] **Step 7: 최종 Commit**

```bash
git add -A
git commit -m "feat: search-service 통합검색 MVP 완성 (unified index, permission filter, 색인 연동)"
```

---

## 구현 후 제약사항 & 다음 단계

| 항목 | MVP 구현 | 다음 단계 |
|------|---------|-----------|
| 권한 필터 | ownerId OR visibility=public | labId 기반 LAB visibility 추가 |
| 히스토리 스토리지 | PostgreSQL | Redis ZADD로 마이그레이션 |
| 색인 파이프라인 | HTTP 동기 (fire-and-forget) | Kafka 이벤트 기반 |
| 재색인 | 없음 | Reconciliation Job 추가 |
| 자동완성 | phrase_prefix | OpenSearch Completion Suggester |
