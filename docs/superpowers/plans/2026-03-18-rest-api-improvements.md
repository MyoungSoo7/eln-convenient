# REST API Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace verb-based REST URLs with noun/resource-based equivalents across backend routes and matching frontend API calls.

**Architecture:** Pragmatic REST — fix clear violations (verb URLs, wrong HTTP methods) while keeping semantic workflow actions (approve/reject, sign/revoke) that have legitimate domain meaning. Each task is a self-contained backend+frontend pair.

**Tech Stack:** Express (most services), Fastify (scheduler, API gateway), TypeScript, React/Vite (frontend)

---

## File Map

| File | Change |
|------|--------|
| `services/file-service/src/routes/export.routes.ts` | Merge `/pdf` + `/zip` into `POST /` with `{ type }` |
| `services/file-service/src/controllers/export.controller.ts` | Add `createExport`, keep pdf/zip handlers for internal use |
| `services/api-gateway/src/routes/proxy.ts` | `/api/export` → `/api/exports`, point to file-service |
| `services/eln-service/src/routes/template.routes.ts` | `POST /recommend` → `GET /recommendations` |
| `services/inventory-service/src/routes/inventory.routes.ts` | `/alerts/expiring` + `/alerts/low-stock` → `/alerts?type=` |
| `services/inventory-service/src/controllers/inventory.controller.ts` | Add `getAlerts`, remove `getExpiringItems`/`getLowStockItems` |
| `src/api/signatures.ts` | Update export API calls |
| `src/api/inventory.ts` | Update alerts API calls |

---

## Task 1: Fix Export Routes (Backend)

**Files:**
- Modify: `services/file-service/src/routes/export.routes.ts`
- Modify: `services/file-service/src/controllers/export.controller.ts`

**Context:** Currently `POST /pdf` and `POST /zip` are verb URLs. The server mounts this router at `/api/exports` already (`index.ts` line 41). The frontend calls `/export/pdf/${noteId}` (wrong path AND puts noteId in URL), `/export/zip`, and `/export/status/:jobId`.

- [ ] **Step 1: Update export routes file**

Replace `services/file-service/src/routes/export.routes.ts` with:

```typescript
// services/file-service/src/routes/export.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/export.controller';

const router = Router();
router.use(requireAuth);

router.post('/',               ctrl.createExport);
router.get('/',                ctrl.listExports);
router.get('/:jobId',          ctrl.getExport);
router.get('/:jobId/download', ctrl.downloadExport);
router.delete('/:jobId',       ctrl.cancelExport);

export default router;
```

- [ ] **Step 2: Add `createExport` to export controller**

Add this function to `services/file-service/src/controllers/export.controller.ts` before `listExports`, replacing the two separate handlers. The new function dispatches to the existing pdf/zip logic:

```typescript
// ─── POST /api/exports ───────────────────────────────────────────
export async function createExport(req: Request, res: Response): Promise<void> {
  const { type } = req.body;
  if (type === 'pdf') {
    return createPdfExport(req, res);
  }
  if (type === 'zip') {
    return createZipExport(req, res);
  }
  res.status(400).json({ ok: false, error: 'type은 pdf 또는 zip 이어야 합니다.' });
}
```

- [ ] **Step 3: Commit**

```bash
git add services/file-service/src/routes/export.routes.ts services/file-service/src/controllers/export.controller.ts
git commit -m "feat(export): merge /pdf and /zip into POST /exports {type}"
```

---

## Task 2: Fix API Gateway Proxy for Export

**Files:**
- Modify: `services/api-gateway/src/routes/proxy.ts`

**Context:** The proxy table has `/api/export` → `signature-audit-service:8003`. This is both wrong path (singular) and wrong upstream (export is in file-service:8008, not signature-audit-service). `file-service` is already registered as `/api/files` → `file-service:8008`.

- [ ] **Step 1: Update proxy table**

In `services/api-gateway/src/routes/proxy.ts`, change:

```typescript
  '/api/export':     process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
```

to:

```typescript
  '/api/exports':    process.env.FILE_SERVICE_URL        || 'http://file-service:8008',
```

- [ ] **Step 2: Commit**

```bash
git add services/api-gateway/src/routes/proxy.ts
git commit -m "fix(gateway): route /api/exports to file-service (was /api/export → wrong service)"
```

---

## Task 3: Fix Template Recommendations Route

**Files:**
- Modify: `services/eln-service/src/routes/template.routes.ts`

**Context:** `POST /recommend` should be `GET /recommendations` — it's a read-only query (no body mutation, reads `req.query.category`). The controller already uses `req.query`, so only the route definition changes.

- [ ] **Step 1: Update template routes file**

In `services/eln-service/src/routes/template.routes.ts`, change:

```typescript
router.post('/recommend',     requirePermission('template:read'),   ctrl.recommendTemplates);
```

to:

```typescript
router.get('/recommendations', requirePermission('template:read'),   ctrl.recommendTemplates);
```

- [ ] **Step 2: Commit**

```bash
git add services/eln-service/src/routes/template.routes.ts
git commit -m "feat(templates): POST /recommend → GET /recommendations"
```

---

## Task 4: Fix Inventory Alerts Routes

**Files:**
- Modify: `services/inventory-service/src/routes/inventory.routes.ts`
- Modify: `services/inventory-service/src/controllers/inventory.controller.ts`

**Context:** Two separate routes `/alerts/expiring` and `/alerts/low-stock` should become one `GET /alerts?type=expiring|low-stock`. The two controller handlers have different logic so we add a dispatcher `getAlerts` that calls each.

- [ ] **Step 1: Add `getAlerts` dispatcher to inventory controller**

In `services/inventory-service/src/controllers/inventory.controller.ts`, add this function right before `getExpiringItems`:

```typescript
/** GET /api/inventory/alerts?type=expiring|low-stock */
export async function getAlerts(req: Request, res: Response): Promise<void> {
  const { type } = req.query;
  if (type === 'expiring') return getExpiringItems(req, res);
  if (type === 'low-stock') return getLowStockItems(req, res);
  res.status(400).json({ ok: false, error: 'type은 expiring 또는 low-stock 이어야 합니다.' });
}
```

- [ ] **Step 2: Update inventory routes**

In `services/inventory-service/src/routes/inventory.routes.ts`, replace:

```typescript
router.get('/alerts/expiring',          requirePermission('inventory:read'),    ctrl.getExpiringItems);
router.get('/alerts/low-stock',         requirePermission('inventory:read'),    ctrl.getLowStockItems);
```

with:

```typescript
router.get('/alerts',                   requirePermission('inventory:read'),    ctrl.getAlerts);
```

- [ ] **Step 3: Commit**

```bash
git add services/inventory-service/src/routes/inventory.routes.ts services/inventory-service/src/controllers/inventory.controller.ts
git commit -m "feat(inventory): /alerts/expiring + /alerts/low-stock → /alerts?type="
```

---

## Task 5: Fix Frontend Export API Calls

**Files:**
- Modify: `src/api/signatures.ts`

**Context:** Frontend currently calls:
- `POST /export/pdf/${noteId}` — wrong path + noteId in URL instead of body
- `POST /export/zip` — wrong path
- `GET /export/status/:jobId` — wrong path (should use `GET /exports/:jobId`)

- [ ] **Step 1: Update signatures.ts export functions**

In `src/api/signatures.ts`, replace the three export functions:

```typescript
// ── 내보내기 API ──
export async function requestPdfExport(noteId: string): Promise<ApiResponse<ExportJob>> {
  try {
    const res = await apiClient.post<{ data: ExportJob }>('/exports', { type: 'pdf', noteId });
    return { ok: res.ok, data: res.data?.data ?? (res.data as any), error: res.error };
  } catch {
    return {
      ok: true,
      data: {
        id: `job-pdf-${Date.now()}`, noteId, format: 'pdf',
        status: 'pending', createdAt: new Date().toISOString(),
      },
    };
  }
}

export async function requestZipExport(noteIds: string[]): Promise<ApiResponse<ExportJob>> {
  try {
    const res = await apiClient.post<{ data: ExportJob }>('/exports', { type: 'zip', scope: 'selected', noteIds });
    return { ok: res.ok, data: res.data?.data ?? (res.data as any), error: res.error };
  } catch {
    return {
      ok: true,
      data: {
        id: `job-zip-${Date.now()}`, noteId: 'bulk', format: 'zip',
        status: 'pending', createdAt: new Date().toISOString(),
      },
    };
  }
}

export async function getExportStatus(jobId: string): Promise<ApiResponse<ExportJob>> {
  try {
    return await apiClient.get<ExportJob>(`/exports/${jobId}`);
  } catch {
    return {
      ok: true,
      data: {
        id: jobId, noteId: '', format: 'pdf',
        status: 'completed', fileUrl: undefined, createdAt: new Date().toISOString(),
      },
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/signatures.ts
git commit -m "feat(frontend): update export API calls to POST /exports {type}"
```

---

## Task 6: Fix Frontend Inventory Alerts API Calls

**Files:**
- Modify: `src/api/inventory.ts`

**Context:** Frontend calls `/inventory/alerts/expiring` and `/inventory/alerts/low-stock` separately. Now both use `/inventory/alerts?type=`.

- [ ] **Step 1: Update inventory.ts alert functions**

In `src/api/inventory.ts`, replace:

```typescript
export async function getExpiringItems(days = 90): Promise<ApiResponse<ExpiringItem[]>> {
  try {
    return await apiClient.get<ExpiringItem[]>('/inventory/alerts/expiring', { days: String(days) });
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '만료 임박 조회 실패' };
  }
}

export async function getLowStockItems(): Promise<ApiResponse<InventoryItem[]>> {
  try {
    return await apiClient.get<InventoryItem[]>('/inventory/alerts/low-stock');
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '재고 부족 조회 실패' };
  }
}
```

with:

```typescript
export async function getExpiringItems(days = 90): Promise<ApiResponse<ExpiringItem[]>> {
  try {
    return await apiClient.get<ExpiringItem[]>('/inventory/alerts', { type: 'expiring', days: String(days) });
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '만료 임박 조회 실패' };
  }
}

export async function getLowStockItems(): Promise<ApiResponse<InventoryItem[]>> {
  try {
    return await apiClient.get<InventoryItem[]>('/inventory/alerts', { type: 'low-stock' });
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '재고 부족 조회 실패' };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/inventory.ts
git commit -m "feat(frontend): /alerts/expiring + /alerts/low-stock → /alerts?type="
```

---

## Final Verification

- [ ] **TypeScript 빌드 확인**

```bash
cd services/file-service && npx tsc --noEmit
cd services/eln-service && npx tsc --noEmit
cd services/inventory-service && npx tsc --noEmit
cd services/api-gateway && npx tsc --noEmit
npx tsc --noEmit  # frontend
```

Expected: no errors

- [ ] **API 엔드포인트 grep 검증 — 구 URL이 남아있지 않은지 확인**

```bash
grep -r "export/pdf\|export/zip\|export/status\|alerts/expiring\|alerts/low-stock\|templates/recommend" src/ services/
```

Expected: no matches (only in plan/spec docs is ok)
