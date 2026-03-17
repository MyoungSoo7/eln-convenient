# ELN Backend Features [3.5, 3.7] Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** inventory-service에 새 아이템 타입 추가 및 검증, search-service에 최근 검색어·즐겨찾기 API 구현 (PostgreSQL + Prisma).

**Architecture:** inventory-service는 기존 `createItem` 컨트롤러에 type 검증만 추가 (Edit 방식). search-service는 Prisma/PostgreSQL 의존성을 새로 추가하고 검색 히스토리·즐겨찾기 기능을 별도 컨트롤러 파일로 분리 구현. 인증은 모든 라우트에 `requireAuth` 미들웨어를 통해 처리하며, 컨트롤러 내 `userId` 수동 null-check는 `deleteHistoryEntry`/`removeFavorite`처럼 인가(authorization) 체크가 필요한 함수에만 추가.

**Tech Stack:** TypeScript, Express 4, Prisma 5, PostgreSQL, uuid v9, @opensearch-project/opensearch

> **Note on [3.6] Scheduler Service:** `createBooking`, `getBookings` (status 필터), approve/reject 모두 이미 완전히 구현됨 — 추가 작업 없음.

---

## File Map

### inventory-service
| 파일 | 작업 |
|------|------|
| `services/inventory-service/src/dtos/inventory.dto.ts` | `ItemType` 타입 한 줄 수정 + `VALID_ITEM_TYPES` 상수 추가 |
| `services/inventory-service/src/controllers/inventory.controller.ts` | `createItem`에 type 검증 5줄 추가 |

### search-service
| 파일 | 작업 |
|------|------|
| `services/search-service/package.json` | `@prisma/client`, `prisma` 의존성 추가 |
| `services/search-service/prisma/schema.prisma` | `SearchHistory`, `Favorite` 모델 정의 (신규) |
| `services/search-service/src/lib/prisma.ts` | Prisma 클라이언트 싱글톤 (신규) |
| `services/search-service/src/controllers/history.controller.ts` | 검색 히스토리 CRUD (신규) |
| `services/search-service/src/controllers/favorites.controller.ts` | 즐겨찾기 CRUD (신규) |
| `services/search-service/src/controllers/search.controller.ts` | 기존 `search` 함수에 히스토리 자동 저장 2줄 추가 |
| `services/search-service/src/routes/search.routes.ts` | 히스토리·즐겨찾기 라우트 추가 |
| `services/search-service/src/index.ts` | Prisma `$connect()` 초기화 추가 |
| `services/search-service/Dockerfile` | `RUN npx prisma generate` 추가 |
| `services/docker-compose.yml` | search-service에 `DATABASE_URL`, `depends_on: postgres` 추가 |

---

## Task 1: [3.5] inventory-service — ItemType 확장 및 type 검증 추가

**Files:**
- Modify: `services/inventory-service/src/dtos/inventory.dto.ts` (line 1)
- Modify: `services/inventory-service/src/controllers/inventory.controller.ts` (line 1, line 83–87)

- [ ] **Step 1: ItemType 타입 정의 한 줄 수정 (Edit)**

`services/inventory-service/src/dtos/inventory.dto.ts`에서 **오직 `ItemType` 줄만** 변경:

```
// 변경 전 (line 1):
export type ItemType = 'reagent' | 'sample' | 'equipment' | 'consumable' | 'antibody' | 'plasmid' | 'cell_line' | 'other';

// 변경 후 (line 1):
export type ItemType = 'reagent' | 'sample' | 'equipment' | 'consumable' | 'antibody' | 'plasmid' | 'cell_line' | 'output' | 'license' | 'infrastructure' | 'other';
```

그 다음 줄 `export type ItemStatus = ...` 바로 **앞에** 다음 상수를 삽입:

```typescript
export const VALID_ITEM_TYPES: ItemType[] = [
  'reagent', 'sample', 'equipment', 'consumable',
  'antibody', 'plasmid', 'cell_line',
  'output', 'license', 'infrastructure', 'other',
];
```

나머지 코드(`ItemStatus`, `ChangeType`, `SortField`, `SortOrder`, `CreateItemDto`, `UpdateItemDto`, `AdjustQuantityDto`, `CreateCategoryDto`) 는 **변경하지 않는다.**

- [ ] **Step 2: createItem import 추가**

`services/inventory-service/src/controllers/inventory.controller.ts` line 1의 `import { v4 as uuidv4 }` 줄 뒤에 추가:

```typescript
import { VALID_ITEM_TYPES } from '../dtos/inventory.dto';
```

- [ ] **Step 3: createItem type 검증 삽입**

동일 파일에서 아래 기존 코드 블록을 찾아서:
```typescript
  if (!name || !type) {
    res.status(400).json({ ok: false, error: 'name과 type은 필수입니다.' });
    return;
  }
```

다음으로 교체 (기존 코드 보존 + 검증 블록 추가):
```typescript
  if (!name || !type) {
    res.status(400).json({ ok: false, error: 'name과 type은 필수입니다.' });
    return;
  }
  if (!VALID_ITEM_TYPES.includes(type)) {
    res.status(400).json({
      ok: false,
      error: `유효하지 않은 type입니다. 가능한 값: ${VALID_ITEM_TYPES.join(', ')}`,
    });
    return;
  }
```

- [ ] **Step 4: 빌드 확인**

```bash
cd services/inventory-service && npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 5: Commit**

```bash
git add services/inventory-service/src/dtos/inventory.dto.ts \
        services/inventory-service/src/controllers/inventory.controller.ts
git commit -m "feat(inventory): add output/license/infrastructure types + type validation"
```

---

## Task 2: [3.7] search-service — Prisma 설치 및 DB 스키마 정의

**Files:**
- Modify: `services/search-service/package.json`
- Create: `services/search-service/prisma/schema.prisma`
- Create: `services/search-service/src/lib/prisma.ts`

- [ ] **Step 1: Prisma 의존성 설치**

```bash
cd services/search-service
npm install @prisma/client uuid
npm install --save-dev prisma @types/uuid
```

- [ ] **Step 2: Prisma 스키마 생성**

`services/search-service/prisma/schema.prisma` 파일 생성:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model SearchHistory {
  id        String   @id @default(uuid())
  userId    String
  query     String
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}

model Favorite {
  id        String   @id @default(uuid())
  userId    String
  docType   String   // "notes" | "templates" | "inventory"
  docId     String
  title     String
  createdAt DateTime @default(now())

  @@unique([userId, docType, docId])
  @@index([userId])
}
```

- [ ] **Step 3: Prisma 클라이언트 싱글톤 생성 (globalThis 패턴 — inventory-service와 동일)**

`services/search-service/src/lib/prisma.ts` 파일 생성:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
```

- [ ] **Step 4: Prisma 클라이언트 생성**

```bash
cd services/search-service && npx prisma generate
```
Expected: `Generated Prisma Client` 메시지

- [ ] **Step 5: Commit**

```bash
git add services/search-service/package.json \
        services/search-service/package-lock.json \
        services/search-service/prisma/schema.prisma \
        services/search-service/src/lib/prisma.ts
git commit -m "feat(search): add prisma + SearchHistory/Favorite schema"
```

---

## Task 3: [3.7] search-service — 검색 히스토리 컨트롤러

**Files:**
- Create: `services/search-service/src/controllers/history.controller.ts`

인증은 라우트 레벨 `requireAuth`가 보장. `saveHistory`/`getHistory`/`clearHistory`는 `x-user-id` 추가 null-check 없이 `requireAuth`에 의존. `deleteHistoryEntry`는 소유권 체크를 위해 userId 확인 포함.

- [ ] **Step 1: 히스토리 컨트롤러 생성**

`services/search-service/src/controllers/history.controller.ts` 파일 생성:

```typescript
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

/** POST /api/search/history — 검색어 저장 */
export async function saveHistory(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  const { query } = req.body;

  if (!query?.trim()) {
    res.status(400).json({ ok: false, error: 'query는 필수입니다.' });
    return;
  }

  try {
    const entry = await prisma.searchHistory.create({
      data: { id: uuidv4(), userId, query: query.trim() },
    });
    res.status(201).json({ ok: true, data: entry });
  } catch (err) {
    console.error('[saveHistory]', err);
    res.status(500).json({ ok: false, error: '검색어 저장 중 오류가 발생했습니다.' });
  }
}

/** GET /api/search/history — 사용자별 최근 검색어 (최근 20개) */
export async function getHistory(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;

  try {
    const history = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ ok: true, data: history, total: history.length });
  } catch (err) {
    console.error('[getHistory]', err);
    res.status(500).json({ ok: false, error: '검색 히스토리 조회 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/search/history/:id — 특정 검색어 삭제 */
export async function deleteHistoryEntry(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;

  try {
    const entry = await prisma.searchHistory.findUnique({ where: { id: req.params.id } });
    if (!entry) {
      res.status(404).json({ ok: false, error: '검색 기록을 찾을 수 없습니다.' });
      return;
    }
    if (entry.userId !== userId) {
      res.status(403).json({ ok: false, error: '본인의 검색 기록만 삭제할 수 있습니다.' });
      return;
    }

    await prisma.searchHistory.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '검색 기록이 삭제되었습니다.', id: req.params.id });
  } catch (err) {
    console.error('[deleteHistoryEntry]', err);
    res.status(500).json({ ok: false, error: '검색 기록 삭제 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/search/history — 사용자 전체 검색 기록 삭제 */
export async function clearHistory(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;

  try {
    const { count } = await prisma.searchHistory.deleteMany({ where: { userId } });
    res.json({ ok: true, message: `검색 기록 ${count}건이 삭제되었습니다.`, count });
  } catch (err) {
    console.error('[clearHistory]', err);
    res.status(500).json({ ok: false, error: '검색 기록 전체 삭제 중 오류가 발생했습니다.' });
  }
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

```bash
cd services/search-service && npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 3: Commit**

```bash
git add services/search-service/src/controllers/history.controller.ts
git commit -m "feat(search): add search history controller"
```

---

## Task 4: [3.7] search-service — 즐겨찾기 컨트롤러

**Files:**
- Create: `services/search-service/src/controllers/favorites.controller.ts`

- [ ] **Step 1: 즐겨찾기 컨트롤러 생성**

`services/search-service/src/controllers/favorites.controller.ts` 파일 생성:

```typescript
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

const VALID_DOC_TYPES = ['notes', 'templates', 'inventory'] as const;

/** POST /api/search/favorites — 즐겨찾기 추가 */
export async function addFavorite(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  const { docType, docId, title } = req.body;

  if (!docType || !docId || !title) {
    res.status(400).json({ ok: false, error: 'docType, docId, title은 필수입니다.' });
    return;
  }
  if (!VALID_DOC_TYPES.includes(docType)) {
    res.status(400).json({
      ok: false,
      error: `유효하지 않은 docType입니다. 가능한 값: ${VALID_DOC_TYPES.join(', ')}`,
    });
    return;
  }

  try {
    const favorite = await prisma.favorite.create({
      data: { id: uuidv4(), userId, docType, docId, title },
    });
    res.status(201).json({ ok: true, data: favorite });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 즐겨찾기에 추가된 항목입니다.' });
      return;
    }
    console.error('[addFavorite]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 추가 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/search/favorites/:id — 즐겨찾기 제거 */
export async function removeFavorite(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;

  try {
    const favorite = await prisma.favorite.findUnique({ where: { id: req.params.id } });
    if (!favorite) {
      res.status(404).json({ ok: false, error: '즐겨찾기를 찾을 수 없습니다.' });
      return;
    }
    if (favorite.userId !== userId) {
      res.status(403).json({ ok: false, error: '본인의 즐겨찾기만 삭제할 수 있습니다.' });
      return;
    }

    await prisma.favorite.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '즐겨찾기가 제거되었습니다.', id: req.params.id });
  } catch (err) {
    console.error('[removeFavorite]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 제거 중 오류가 발생했습니다.' });
  }
}

/** GET /api/search/favorites — 사용자별 즐겨찾기 목록 */
export async function getFavorites(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  const docType = req.query.docType as string | undefined;

  try {
    // Prisma 타입 호환을 위해 명시적 타입 사용
    const where: { userId: string; docType?: string } = { userId };
    if (docType) where.docType = docType;

    const favorites = await prisma.favorite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, data: favorites, total: favorites.length });
  } catch (err) {
    console.error('[getFavorites]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 조회 중 오류가 발생했습니다.' });
  }
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

```bash
cd services/search-service && npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 3: Commit**

```bash
git add services/search-service/src/controllers/favorites.controller.ts
git commit -m "feat(search): add favorites controller"
```

---

## Task 5: [3.7] search-service — 라우트 및 검색 시 히스토리 자동 저장 연동

**Files:**
- Modify: `services/search-service/src/routes/search.routes.ts`
- Modify: `services/search-service/src/controllers/search.controller.ts`
- Modify: `services/search-service/src/index.ts`

- [ ] **Step 1: search.controller.ts에 import 추가**

`services/search-service/src/controllers/search.controller.ts` 상단 import 블록에 추가:
```typescript
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
```

- [ ] **Step 2: search 함수에 히스토리 자동 저장 삽입**

동일 파일 `search` 함수 내에서 다음 기존 코드를 찾아서:
```typescript
    res.json({
      ok: true,
      query: q,
      results,
      total: hits.total.value ?? hits.total,
      page,
      size,
      took: response.body.took,
    });
```

그 **바로 앞에** 히스토리 저장 코드 삽입 (비동기, 실패 무시):
```typescript
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
```

- [ ] **Step 3: 라우트 파일 교체**

`services/search-service/src/routes/search.routes.ts` 전체를 다음으로 교체:

> **주의:** `DELETE /history` 라우트는 반드시 `DELETE /history/:id` 보다 **앞에** 등록해야 합니다. Express는 위→아래 순서로 매칭하며, 순서가 반대이면 `DELETE /history`가 `id=undefined`로 `:id` 라우트에 잡힙니다.

```typescript
import { Router } from 'express';
import * as ctrl from '../controllers/search.controller';
import * as historyCtrl from '../controllers/history.controller';
import * as favoritesCtrl from '../controllers/favorites.controller';
import { requireAuth, requirePermission, requireInternalSecret } from '../middlewares/auth.middleware';

const router = Router();

// ── 통합 검색 (사용자 인증 필요) ──────────────────────────
router.get('/',         requireAuth, requirePermission('note:read'), ctrl.search);
router.get('/suggest',  requireAuth, requirePermission('note:read'), ctrl.suggest);

// ── 검색 히스토리 ─────────────────────────────────────────
// 주의: DELETE /history 는 반드시 DELETE /history/:id 보다 먼저 등록
router.post('/history',         requireAuth, historyCtrl.saveHistory);
router.get('/history',          requireAuth, historyCtrl.getHistory);
router.delete('/history',       requireAuth, historyCtrl.clearHistory);
router.delete('/history/:id',   requireAuth, historyCtrl.deleteHistoryEntry);

// ── 즐겨찾기 ─────────────────────────────────────────────
router.post('/favorites',       requireAuth, favoritesCtrl.addFavorite);
router.delete('/favorites/:id', requireAuth, favoritesCtrl.removeFavorite);
router.get('/favorites',        requireAuth, favoritesCtrl.getFavorites);

// ── 인덱스 관리 (내부 서비스 전용 — x-internal-secret 헤더 필요) ──
router.post('/index',               requireInternalSecret, ctrl.indexDoc);
router.post('/index/bulk',          requireInternalSecret, ctrl.bulkIndexDocs);
router.delete('/index/:type/:id',   requireInternalSecret, ctrl.removeDoc);
router.get('/stats',                requireInternalSecret, ctrl.statsHandler);

export default router;
```

- [ ] **Step 4: index.ts에 Prisma $connect 추가**

`services/search-service/src/index.ts`에서 다음 기존 코드를 찾아서:
```typescript
import { ensureIndices } from './lib/opensearch';
```

그 뒤에 추가:
```typescript
import prisma from './lib/prisma';
```

그리고 `app.listen` 콜백 내에서 다음 기존 코드를 찾아서:
```typescript
  try {
    await ensureIndices();
```

그 **바로 앞에** 삽입:
```typescript
  try {
    await prisma.$connect();
    console.log('[search-service] PostgreSQL 연결 완료');
  } catch (err) {
    console.error('[search-service] PostgreSQL 연결 실패:', err);
  }
```

- [ ] **Step 5: TypeScript 빌드 확인**

```bash
cd services/search-service && npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 6: Commit**

```bash
git add services/search-service/src/routes/search.routes.ts \
        services/search-service/src/controllers/search.controller.ts \
        services/search-service/src/index.ts
git commit -m "feat(search): wire history/favorites routes + auto-save search history"
```

---

## Task 6: Dockerfile, docker-compose, DB 마이그레이션

**Files:**
- Modify: `services/search-service/Dockerfile`
- Modify: `services/docker-compose.yml`

- [ ] **Step 1: Dockerfile에 prisma generate 추가**

`services/search-service/Dockerfile`에서 다음 기존 코드를 찾아서:
```dockerfile
COPY . .
RUN npm run build
```

다음으로 교체 (`COPY . .` 이후, `npm run build` 이전에 `prisma generate` 실행):
```dockerfile
COPY . .
RUN npx prisma generate
RUN npm run build
```

- [ ] **Step 2: docker-compose.yml에 search-service DB 환경변수 추가**

`services/docker-compose.yml`에서 `search-service` 섹션을 찾아서:
```yaml
  search-service:
    build: ./search-service
    container_name: labnote-search
    ports:
      - "${SEARCH_PORT:-8006}:8006"
    environment:
      - PORT=8006
      - OPENSEARCH_URL=http://opensearch:9200
    depends_on:
      opensearch:
        condition: service_healthy
```

다음으로 교체:
```yaml
  search-service:
    build: ./search-service
    container_name: labnote-search
    ports:
      - "${SEARCH_PORT:-8006}:8006"
    environment:
      - PORT=8006
      - OPENSEARCH_URL=http://opensearch:9200
      - DATABASE_URL=postgresql://labnote:labnote_secret_2024@postgres:5432/labnote?schema=search
    depends_on:
      postgres:
        condition: service_healthy
      opensearch:
        condition: service_healthy
```

- [ ] **Step 3: DB 마이그레이션 생성 (prisma migrate dev)**

```bash
cd services/search-service
DATABASE_URL="postgresql://labnote:labnote_secret_2024@localhost:5432/labnote?schema=search" \
  npx prisma migrate dev --name init
```
Expected: `migrations/` 폴더 생성, `SearchHistory` 및 `Favorite` 테이블 생성

- [ ] **Step 4: Commit**

```bash
git add services/search-service/Dockerfile \
        services/docker-compose.yml \
        services/search-service/prisma/migrations/
git commit -m "chore(search): add prisma generate to dockerfile, configure db in docker-compose, add migration"
```

---

## API 요약

### inventory-service (포트 8004)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/inventory/items` | 항목 추가 (output/license/infrastructure 포함, type 검증) |
| GET | `/api/inventory/items?category=...&type=...` | 카테고리/타입 필터 조회 |

### search-service (포트 8006)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/search?q=...&type=notes,inventory` | 통합 검색 (자동 히스토리 저장) |
| POST | `/api/search/history` | 검색어 수동 저장 |
| GET | `/api/search/history` | 최근 검색어 (최대 20개) |
| DELETE | `/api/search/history` | 전체 검색 기록 삭제 **(/:id 보다 먼저 선언됨)** |
| DELETE | `/api/search/history/:id` | 특정 검색어 삭제 |
| POST | `/api/search/favorites` | 즐겨찾기 추가 |
| DELETE | `/api/search/favorites/:id` | 즐겨찾기 제거 |
| GET | `/api/search/favorites?docType=notes` | 즐겨찾기 목록 (docType 필터 가능) |
