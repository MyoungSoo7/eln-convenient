# Frontend API Integration Design

**Date:** 2026-03-17
**Scope:** `src/api/ai.ts`, `src/pages/AIAssistantPage.tsx`, `src/api/admin.ts` (new), `src/pages/AdminPage.tsx`
**Branch:** feature/phase2-todo-service

---

## Context

Four frontend pages exist with substantial UI implementations. SearchPage is fully connected to real APIs. ExportsPage has real API calls but `signatures.ts` still contains mock catch-block fallbacks (out of scope for this spec). Two pages need real API integration:

- **AIAssistantPage** — UI complete, uses hardcoded mock data instead of `ai.ts` functions
- **AdminPage** — UI complete, uses `mockUsers/mockRoles/mockTeams` arrays, no admin API client exists

---

## Approach

Sequential (A): `ai.ts` → `AIAssistantPage` → `admin.ts` → `AdminPage`

Each step is independently verifiable before the next begins.

---

## Step 1: ai.ts — Remove Mock Fallbacks

**File:** `src/api/ai.ts`

Remove hardcoded fallback data from **all four** `catch` blocks. Replace with proper error returns that include the `data` field (required by `ApiResponse<T>` — follow the pattern in `signatures.ts`):

- `recommendTemplate`: `return { ok: false, data: [] as TemplateRecommendation[], error: '템플릿 추천 요청에 실패했습니다.' }`
- `generateDraft`: `return { ok: false, data: null as unknown as DraftResult, error: '초안 생성 요청에 실패했습니다.' }`
- `getIndexStatus`: `return { ok: false, data: null as unknown as IndexStatus, error: '인덱싱 상태 조회에 실패했습니다.' }`
- `askQuestion`: `return { ok: false, data: null as unknown as AskResult, error: 'AI 질문 요청에 실패했습니다.' }`

**Rationale:** Backend is assumed ready. Mock fallbacks hide real failures. All four functions have the same issue.

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
- On success: join `sections` array (format: `## {title}\n{content}`) into a single string for the Textarea
- On failure: show error, allow going back to step 2

**Vector Indexing Status Card:**
- Replace static badge values with `useQuery`:
  ```ts
  queryKey: ['ai', 'indexStatus']
  queryFn: getIndexStatus
  ```
- `IndexStatus` has a single aggregate (`indexedDocuments / totalDocuments`). Display as one row: "전체 인덱싱 ({indexedDocuments}/{totalDocuments})". Remove the three separate category rows — the current static UI shows per-category breakdown but the API does not provide it.
- On failure: show "조회 실패" in place of the badge

### UI Structure

3-step wizard layout unchanged. Only data sources change from static to API-driven.

---

## Step 3: src/api/admin.ts — New API Client

**File:** `src/api/admin.ts` (new)

### Interfaces

```ts
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  status: string;
}

export interface AdminTeam {
  id: string;
  name: string;
  memberCount: number;  // Note: mock used `members`, API uses `memberCount`
  lead: string;
}

export interface AdminRole {
  id?: string;  // optional: backend may key roles by name
  name: string;
  permissions: string[];
  userCount: number;
}

export interface CreateUserPayload {
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
  - Users tab: `queryKey: ['admin', 'users']`, `queryFn: listUsers` — loading spinner + error state
  - Teams tab: `queryKey: ['admin', 'teams']`, `queryFn: listTeams` — loading spinner + error state
  - Roles tab: `queryKey: ['admin', 'roles']`, `queryFn: listRoles` — loading spinner + error state
- Team card: update `t.members` reference to `t.memberCount` to match the `AdminTeam` interface
- "사용자 추가" button: open a `Dialog` with form fields (name, email, role, team) → on submit call `createUser(payload)` via `useMutation` → on success: show `toast({ title: '사용자 추가 완료' })`, close Dialog, invalidate `['admin', 'users']` query
- Settings tab: unchanged (TODO state preserved)

### Error Handling

Each tab shows an inline error card if the query fails, with a retry button (`refetch`).

---

## Out of Scope

- SearchPage (already complete)
- ExportsPage (already complete)
- Backend implementation (handled by other terminals)
- Settings tab activation (backend not ready)
- `askQuestion` UI wiring (function exists in `ai.ts` but not used in `AIAssistantPage` currently)
