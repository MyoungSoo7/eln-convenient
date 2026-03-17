# Frontend API Integration Design

**Date:** 2026-03-17
**Scope:** `src/api/ai.ts`, `src/pages/AIAssistantPage.tsx`, `src/api/admin.ts` (new), `src/pages/AdminPage.tsx`
**Branch:** feature/phase2-todo-service

---

## Context

Four frontend pages exist with substantial UI implementations. Two are already fully connected to real APIs (SearchPage, ExportsPage). Two need real API integration:

- **AIAssistantPage** — UI complete, uses hardcoded mock data instead of `ai.ts` functions
- **AdminPage** — UI complete, uses `mockUsers/mockRoles/mockTeams` arrays, no admin API client exists

---

## Approach

Sequential (A): `ai.ts` → `AIAssistantPage` → `admin.ts` → `AdminPage`

Each step is independently verifiable before the next begins.

---

## Step 1: ai.ts — Remove Mock Fallbacks

**File:** `src/api/ai.ts`

Remove hardcoded fallback data from all three `catch` blocks. Replace with proper error returns:

- `recommendTemplate`: `return { ok: false, error: '템플릿 추천 요청에 실패했습니다.' }`
- `generateDraft`: `return { ok: false, error: '초안 생성 요청에 실패했습니다.' }`
- `getIndexStatus`: `return { ok: false, error: '인덱싱 상태 조회에 실패했습니다.' }`

**Rationale:** Backend is assumed ready. Mock fallbacks hide real failures.

---

## Step 2: AIAssistantPage.tsx — Real API Connection

**File:** `src/pages/AIAssistantPage.tsx`

### Changes

**Step 2 (Template Recommendation):**
- Remove `templateSuggestions` hardcoded array
- On "템플릿 추천받기" click: call `recommendTemplate(topic)`, show loading spinner
- On success: render recommendations from API response (`templateId`, `name`, `score`, `reason`)
- On failure: show inline error message, allow retry

**Step 3 (Draft Generation):**
- Remove `setTimeout` mock
- On template card click: call `generateDraft(templateId, topic)`
- On success: render draft content (join `sections` array into markdown-like text for the Textarea)
- On failure: show error, allow going back to step 2

**Vector Indexing Status Card:**
- Replace static badge values with `useQuery` calling `getIndexStatus()`
- Display `indexedDocuments / totalDocuments` per category
- On failure: show "조회 실패" in place of badges

### UI Structure

3-step wizard layout unchanged. Only data sources change from static to API-driven.

---

## Step 3: src/api/admin.ts — New API Client

**File:** `src/api/admin.ts` (new)

### Interfaces

```ts
interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  status: string;
}

interface AdminTeam {
  id: string;
  name: string;
  memberCount: number;
  lead: string;
}

interface AdminRole {
  name: string;
  permissions: string[];
  userCount: number;
}

interface CreateUserPayload {
  name: string;
  email: string;
  role: string;
  team: string;
}
```

### Endpoints

| Function | Method | Path |
|----------|--------|------|
| `listUsers()` | GET | `/api/admin/users` |
| `createUser(payload)` | POST | `/api/admin/users` |
| `listTeams()` | GET | `/api/admin/teams` |
| `listRoles()` | GET | `/api/admin/roles` |

All return `ApiResponse<T>` using `apiClient` from `./client`.

---

## Step 4: AdminPage.tsx — Real API Connection

**File:** `src/pages/AdminPage.tsx`

### Changes

- Remove `mockUsers`, `mockTeams`, `mockRoles` arrays
- Add `useQuery` calls per tab:
  - Users tab: `listUsers()` with loading spinner + error state
  - Teams tab: `listTeams()` with loading spinner + error state
  - Roles tab: `listRoles()` with loading spinner + error state
- "사용자 추가" button: open a `Dialog` with a form (name, email, role, team fields) → on submit call `createUser(payload)` → invalidate users query on success
- Settings tab: unchanged (TODO state preserved)

### Error Handling

Each tab shows an inline error card if the query fails, with a retry button (`refetch`).

---

## Out of Scope

- SearchPage (already complete)
- ExportsPage (already complete)
- Backend implementation (handled by other terminals)
- Settings tab activation (backend not ready)
