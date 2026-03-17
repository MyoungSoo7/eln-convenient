# Frontend API Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect AIAssistantPage and AdminPage to real backend APIs, removing all hardcoded mock data.

**Architecture:** Sequential — fix `ai.ts` error returns first, then wire `AIAssistantPage`, then create `admin.ts`, then wire `AdminPage`. Each task produces independently testable output. Admin page adds a Dialog for creating users via `useMutation`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + jsdom + @testing-library/react, @tanstack/react-query, shadcn/ui (Radix), `apiClient` from `src/api/client.ts`

**Spec:** `docs/superpowers/specs/2026-03-17-frontend-api-integration-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/api/ai.ts` | Remove mock catch fallbacks → proper error returns |
| Modify | `src/pages/AIAssistantPage.tsx` | Wire to real `recommendTemplate`, `generateDraft`, `getIndexStatus` |
| Create | `src/api/admin.ts` | Admin CRUD API client (users, teams, roles) |
| Modify | `src/pages/AdminPage.tsx` | Replace mock arrays with `useQuery` + `useMutation` |
| Create | `src/api/admin.test.ts` | Unit tests for admin API functions |
| Create | `src/pages/AIAssistantPage.test.tsx` | Integration tests for AIAssistantPage API wiring |
| Create | `src/pages/AdminPage.test.tsx` | Integration tests for AdminPage query/mutation wiring |

---

## Task 1: Fix ai.ts Error Returns

**Files:**
- Modify: `src/api/ai.ts`

Remove mock `ok: true` catch-block fallbacks from all four functions. Replace with proper error shapes that include the `data` field (TypeScript requires it — `ApiResponse<T>` has non-optional `data: T`).

### Pattern reference (from `src/api/signatures.ts`):
```ts
return { ok: false, data: null as unknown as SomeType, error: 'message' };
// or for array types:
return { ok: false, data: [] as SomeType[], error: 'message' };
```

- [ ] **Step 1: Replace `recommendTemplate` catch block**

In `src/api/ai.ts`, find the `catch` block inside `recommendTemplate` (around line 36). Replace the entire `catch` body with:
```ts
} catch {
  return { ok: false, data: [] as TemplateRecommendation[], error: '템플릿 추천 요청에 실패했습니다.' };
}
```

- [ ] **Step 2: Replace `generateDraft` catch block**

Find the `catch` block inside `generateDraft`. Replace with:
```ts
} catch {
  return { ok: false, data: null as unknown as DraftResult, error: '초안 생성 요청에 실패했습니다.' };
}
```

- [ ] **Step 3: Replace `getIndexStatus` catch block**

Find the `catch` block inside `getIndexStatus`. Replace with:
```ts
} catch {
  return { ok: false, data: null as unknown as IndexStatus, error: '인덱싱 상태 조회에 실패했습니다.' };
}
```

- [ ] **Step 4: Replace `askQuestion` catch block**

Find the `catch` block inside `askQuestion`. Replace with:
```ts
} catch {
  return { ok: false, data: null as unknown as AskResult, error: 'AI 질문 요청에 실패했습니다.' };
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors in `src/api/ai.ts`

- [ ] **Step 6: Commit**

```bash
git add src/api/ai.ts
git commit -m "fix: remove mock catch fallbacks from ai.ts — return real errors"
```

---

## Task 2: Wire AIAssistantPage to Real APIs

**Files:**
- Modify: `src/pages/AIAssistantPage.tsx`
- Create: `src/pages/AIAssistantPage.test.tsx`

### What changes in the component:
- `templateSuggestions` hardcoded array → deleted
- `handleRecommend`: calls `recommendTemplate(topic)` via `useState` + async handler; shows loading; sets recs or error
- `handleGenerate(templateId)`: calls `generateDraft(templateId, topic)`; joins sections into markdown string
- Vector indexing card: `useQuery` polling `getIndexStatus()`

- [ ] **Step 1: Write failing test for template recommendation**

Create `src/pages/AIAssistantPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AIAssistantPage from './AIAssistantPage';
import * as ai from '@/api/ai';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('AIAssistantPage', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('calls recommendTemplate with topic and renders results', async () => {
    vi.spyOn(ai, 'recommendTemplate').mockResolvedValue({
      ok: true,
      data: [{ templateId: 'tpl-1', name: 'PCR 프로토콜', score: 0.95, reason: '적합합니다.' }],
    });
    vi.spyOn(ai, 'getIndexStatus').mockResolvedValue({
      ok: true,
      data: { totalDocuments: 100, indexedDocuments: 95, pendingDocuments: 5, lastUpdated: '' },
    });

    render(<AIAssistantPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/CRISPR/), { target: { value: 'PCR 실험' } });
    fireEvent.click(screen.getByText('템플릿 추천받기'));

    await waitFor(() => expect(screen.getByText('PCR 프로토콜')).toBeInTheDocument());
    expect(ai.recommendTemplate).toHaveBeenCalledWith('PCR 실험');
  });

  it('shows error when recommendTemplate fails', async () => {
    vi.spyOn(ai, 'recommendTemplate').mockResolvedValue({
      ok: false, data: [], error: '템플릿 추천 요청에 실패했습니다.',
    });
    vi.spyOn(ai, 'getIndexStatus').mockResolvedValue({
      ok: true,
      data: { totalDocuments: 10, indexedDocuments: 10, pendingDocuments: 0, lastUpdated: '' },
    });

    render(<AIAssistantPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/CRISPR/), { target: { value: 'PCR 실험' } });
    fireEvent.click(screen.getByText('템플릿 추천받기'));

    await waitFor(() => expect(screen.getByText('템플릿 추천 요청에 실패했습니다.')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/pages/AIAssistantPage.test.tsx
```
Expected: FAIL — component still uses hardcoded mock data

- [ ] **Step 3: Update AIAssistantPage.tsx — imports and state**

At the top of `src/pages/AIAssistantPage.tsx`, add:
```tsx
import { useQuery } from "@tanstack/react-query";
import { recommendTemplate, generateDraft, getIndexStatus } from "@/api/ai";
import type { TemplateRecommendation } from "@/api/ai";
```

Replace existing state declarations with:
```tsx
const [step, setStep] = useState(1);
const [topic, setTopic] = useState("");
const [recommending, setRecommending] = useState(false);
const [recommendations, setRecommendations] = useState<TemplateRecommendation[]>([]);
const [recommendError, setRecommendError] = useState<string | null>(null);
const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
const [generating, setGenerating] = useState(false);
const [draft, setDraft] = useState("");
const [generateError, setGenerateError] = useState<string | null>(null);
```

Delete the `templateSuggestions` constant.

- [ ] **Step 4: Update handleRecommend**

Replace `handleRecommend` with:
```tsx
const handleRecommend = async () => {
  if (!topic.trim()) return;
  setRecommending(true);
  setRecommendError(null);
  const res = await recommendTemplate(topic);
  setRecommending(false);
  if (!res.ok || !res.data) {
    setRecommendError(res.error ?? '템플릿 추천에 실패했습니다.');
    return;
  }
  setRecommendations(res.data);
  setStep(2);
};
```

- [ ] **Step 5: Update handleGenerate**

Replace `handleGenerate` (and remove the old `() =>` signature) with:
```tsx
const handleGenerate = async (templateId: string) => {
  setSelectedTemplateId(templateId);
  setGenerating(true);
  setGenerateError(null);
  setStep(3);
  const res = await generateDraft(templateId, topic);
  setGenerating(false);
  if (!res.ok || !res.data) {
    setGenerateError(res.error ?? '초안 생성에 실패했습니다.');
    return;
  }
  const text = res.data.sections
    .map((s) => `## ${s.title}\n${s.content}`)
    .join('\n\n');
  setDraft(text);
};
```

Also update `resetWizard`:
```tsx
const resetWizard = () => {
  setStep(1);
  setTopic("");
  setDraft("");
  setRecommendations([]);
  setRecommendError(null);
  setSelectedTemplateId(null);
  setGenerateError(null);
};
```

- [ ] **Step 6: Update Step 2 JSX — use recommendations state**

In the Step 2 JSX block, replace `{templateSuggestions.map((t) => (` with `{recommendations.map((t) => (`.

Update the card content to use API fields:
```tsx
<Card key={t.templateId} className="shadow-card hover:shadow-elevated transition-all cursor-pointer group"
  onClick={() => handleGenerate(t.templateId)}>
  <CardContent className="p-4 flex items-start justify-between">
    <div>
      <h4 className="font-medium group-hover:text-primary transition-colors">{t.name}</h4>
      <p className="text-xs text-muted-foreground mt-1">{t.reason}</p>
    </div>
    <Badge className="gradient-primary text-primary-foreground text-[10px]">
      일치 {Math.round(t.score * 100)}%
    </Badge>
  </CardContent>
</Card>
```

Also add loading and error states above the recommendations list:
```tsx
{recommending && (
  <div className="flex items-center gap-2 text-muted-foreground py-4">
    <Loader2 className="h-5 w-5 animate-spin" />
    <span>템플릿을 추천받는 중...</span>
  </div>
)}
{recommendError && (
  <p className="text-sm text-destructive py-2">{recommendError}</p>
)}
```

- [ ] **Step 7: Update Step 3 JSX — add generateError display**

Inside the Step 3 block, after the generating spinner, add error display:
```tsx
{generateError && !generating && (
  <div className="space-y-3">
    <p className="text-sm text-destructive">{generateError}</p>
    <Button variant="outline" onClick={() => { setStep(2); setGenerateError(null); }}>
      템플릿 다시 선택
    </Button>
  </div>
)}
```

- [ ] **Step 8: Update Vector Indexing Status card**

First, **delete the three existing static badge rows** inside the Vector Indexing Status card `CardContent` (the lines rendering "연구노트 인덱싱", "프로토콜 인덱싱", "외부 논문 색인" with hardcoded counts).

Add the query near the top of the component (with other hooks):
```tsx
const { data: indexStatus, isError: indexError } = useQuery({
  queryKey: ['ai', 'indexStatus'],
  queryFn: async () => {
    const res = await getIndexStatus();
    if (!res.ok) throw new Error(res.error ?? '조회 실패');
    return res.data;
  },
  staleTime: 60_000,
});
```

Replace the three static badge rows inside the Vector Indexing Status card with:
```tsx
<div className="flex items-center justify-between">
  <span className="text-sm">전체 인덱싱</span>
  {indexError ? (
    <Badge variant="secondary" className="text-[10px] text-destructive">조회 실패</Badge>
  ) : !indexStatus ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  ) : (
    <Badge variant="secondary" className="text-[10px]">
      {indexStatus.indexedDocuments}/{indexStatus.totalDocuments}
    </Badge>
  )}
</div>
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run src/pages/AIAssistantPage.test.tsx
```
Expected: all tests PASS

- [ ] **Step 10: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 11: Commit**

```bash
git add src/pages/AIAssistantPage.tsx src/pages/AIAssistantPage.test.tsx
git commit -m "feat: wire AIAssistantPage to real API — remove mock data"
```

---

## Task 3: Create src/api/admin.ts

**Files:**
- Create: `src/api/admin.ts`
- Create: `src/api/admin.test.ts`

- [ ] **Step 1: Write failing tests for admin API**

Create `src/api/admin.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as clientModule from '@/api/client';

describe('admin API', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSpy = vi.spyOn(clientModule.apiClient, 'get');
    postSpy = vi.spyOn(clientModule.apiClient, 'post');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('listUsers calls GET /api/admin/users', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listUsers } = await import('@/api/admin');
    await listUsers();
    expect(getSpy).toHaveBeenCalledWith('/admin/users');
  });

  it('createUser calls POST /api/admin/users with payload', async () => {
    postSpy.mockResolvedValue({ ok: true, data: {} });
    const { createUser } = await import('@/api/admin');
    const payload = { name: '홍길동', email: 'hong@lab.kr', role: 'Researcher', team: '연구팀' };
    await createUser(payload);
    expect(postSpy).toHaveBeenCalledWith('/admin/users', payload);
  });

  it('listTeams calls GET /api/admin/teams', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listTeams } = await import('@/api/admin');
    await listTeams();
    expect(getSpy).toHaveBeenCalledWith('/admin/teams');
  });

  it('listRoles calls GET /api/admin/roles', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listRoles } = await import('@/api/admin');
    await listRoles();
    expect(getSpy).toHaveBeenCalledWith('/admin/roles');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/api/admin.test.ts
```
Expected: FAIL — `admin.ts` does not exist yet

- [ ] **Step 3: Create src/api/admin.ts**

```ts
/**
 * 관리자 API 클라이언트
 * 경로: /api/admin/*
 */
import apiClient, { type ApiResponse } from './client';

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
  memberCount: number;
  lead: string;
}

export interface AdminRole {
  id?: string;
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

export async function listUsers(): Promise<ApiResponse<AdminUser[]>> {
  try {
    return await apiClient.get<AdminUser[]>('/admin/users');
  } catch {
    return { ok: false, data: [] as AdminUser[], error: '사용자 목록 조회에 실패했습니다.' };
  }
}

export async function createUser(payload: CreateUserPayload): Promise<ApiResponse<AdminUser>> {
  try {
    return await apiClient.post<AdminUser>('/admin/users', payload);
  } catch {
    return { ok: false, data: null as unknown as AdminUser, error: '사용자 추가에 실패했습니다.' };
  }
}

export async function listTeams(): Promise<ApiResponse<AdminTeam[]>> {
  try {
    return await apiClient.get<AdminTeam[]>('/admin/teams');
  } catch {
    return { ok: false, data: [] as AdminTeam[], error: '팀 목록 조회에 실패했습니다.' };
  }
}

export async function listRoles(): Promise<ApiResponse<AdminRole[]>> {
  try {
    return await apiClient.get<AdminRole[]>('/admin/roles');
  } catch {
    return { ok: false, data: [] as AdminRole[], error: '역할 목록 조회에 실패했습니다.' };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/api/admin.test.ts
```
Expected: all 4 tests PASS

- [ ] **Step 5: Add admin.ts to api/index.ts re-exports**

`src/api/index.ts` already exists. Add one line:
```ts
export * as adminApi from './admin';
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/api/admin.ts src/api/admin.test.ts src/api/index.ts
git commit -m "feat: add admin API client (users, teams, roles)"
```

---

## Task 4: Wire AdminPage to Real APIs

**Files:**
- Modify: `src/pages/AdminPage.tsx`
- Create: `src/pages/AdminPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/pages/AdminPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AdminPage from './AdminPage';
import * as admin from '@/api/admin';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockUsers: admin.AdminUser[] = [
  { id: 'u1', name: '김연구', email: 'kim@lab.kr', role: 'Researcher', team: '유전체팀', status: 'active' },
];
const mockTeams: admin.AdminTeam[] = [
  { id: 't1', name: '유전체팀', memberCount: 3, lead: '김연구' },
];
const mockRoles: admin.AdminRole[] = [
  { name: 'Researcher', permissions: ['노트 작성'], userCount: 3 },
];

describe('AdminPage', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders users from API', async () => {
    vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: true, data: mockUsers });
    vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: mockTeams });
    vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: mockRoles });

    render(<AdminPage />, { wrapper });
    await waitFor(() => expect(screen.getByText('김연구')).toBeInTheDocument());
    expect(screen.getByText('kim@lab.kr')).toBeInTheDocument();
  });

  it('shows error message when listUsers fails', async () => {
    vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: false, data: [], error: '사용자 목록 조회에 실패했습니다.' });
    vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: [] });

    render(<AdminPage />, { wrapper });
    await waitFor(() => expect(screen.getByText(/사용자 목록 조회에 실패했습니다/)).toBeInTheDocument());
  });

  it('opens add user dialog on button click', async () => {
    vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: [] });

    render(<AdminPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /사용자 추가/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/pages/AdminPage.test.tsx
```
Expected: FAIL — page uses mock arrays, not API

- [ ] **Step 3: Rewrite AdminPage.tsx — imports**

Replace existing imports with:
```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Building2, Shield, Plus, Settings, Loader2 } from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "@/hooks/use-toast";
import { listUsers, listTeams, listRoles, createUser } from "@/api/admin";
import type { CreateUserPayload } from "@/api/admin";
```

- [ ] **Step 4: Remove mock arrays, add queries**

Delete the `mockUsers`, `mockTeams`, `mockRoles` constants.

Replace the `AdminPage` function body start with:
```tsx
export default function AdminPage() {
  const qc = useQueryClient();
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [form, setForm] = useState<CreateUserPayload>({ name: '', email: '', role: 'Researcher', team: '' });

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await listUsers();
      if (!res.ok) throw new Error(res.error ?? '사용자 목록 조회 실패');
      return res.data;
    },
  });

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: async () => {
      const res = await listTeams();
      if (!res.ok) throw new Error(res.error ?? '팀 목록 조회 실패');
      return res.data;
    },
  });

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const res = await listRoles();
      if (!res.ok) throw new Error(res.error ?? '역할 목록 조회 실패');
      return res.data;
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => {
      toast({ title: '사용자 추가 완료' });
      setAddUserOpen(false);
      setForm({ name: '', email: '', role: 'Researcher', team: '' });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => {
      toast({ title: '사용자 추가 실패', description: err.message, variant: 'destructive' });
    },
  });
```

- [ ] **Step 5: Update Users tab JSX**

Replace the Users tab content with:
```tsx
<TabsContent value="users" className="mt-4">
  <Card className="shadow-card">
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-base flex items-center gap-2">
        사용자 목록
        <HelpTooltip text="조직에 등록된 모든 사용자를 관리합니다." />
      </CardTitle>
      <Button size="sm" className="gradient-primary text-primary-foreground gap-1"
        onClick={() => setAddUserOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> 사용자 추가
      </Button>
    </CardHeader>
    <CardContent className="p-0">
      {usersQuery.isLoading && (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}
      {usersQuery.isError && (
        <div className="p-4 text-sm text-destructive">
          {(usersQuery.error as Error).message}
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => usersQuery.refetch()}>다시 시도</Button>
        </div>
      )}
      {usersQuery.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>팀</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.data.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{u.role}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{u.team}</TableCell>
                <TableCell><Badge className="text-[10px] bg-success/10 text-success">활성</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

- [ ] **Step 6: Update Teams tab JSX**

Replace the Teams tab content with:
```tsx
<TabsContent value="teams" className="mt-4">
  {teamsQuery.isLoading && (
    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  )}
  {teamsQuery.isError && (
    <p className="text-sm text-destructive p-4">
      {(teamsQuery.error as Error).message}
      <Button variant="ghost" size="sm" className="ml-2" onClick={() => teamsQuery.refetch()}>다시 시도</Button>
    </p>
  )}
  {teamsQuery.data && (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {teamsQuery.data.map((t) => (
        <Card key={t.id} className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Building2 className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="font-semibold">{t.name}</h3>
                <p className="text-xs text-muted-foreground">팀장: {t.lead} · {t.memberCount}명</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )}
</TabsContent>
```

- [ ] **Step 7: Update Roles tab JSX**

Replace the Roles tab content with:
```tsx
<TabsContent value="roles" className="mt-4 space-y-4">
  {rolesQuery.isLoading && (
    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  )}
  {rolesQuery.isError && (
    <p className="text-sm text-destructive p-4">
      {(rolesQuery.error as Error).message}
      <Button variant="ghost" size="sm" className="ml-2" onClick={() => rolesQuery.refetch()}>다시 시도</Button>
    </p>
  )}
  {rolesQuery.data?.map((r) => (
    <Card key={r.id ?? r.name} className="shadow-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{r.name}</h3>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {r.permissions.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}
            </div>
          </div>
          <span className="text-sm text-muted-foreground">{r.userCount}명</span>
        </div>
      </CardContent>
    </Card>
  ))}
</TabsContent>
```

- [ ] **Step 8: Add add-user Dialog**

Before the closing `</div>` of the component, add:
```tsx
<Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>사용자 추가</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <label className="text-sm font-medium">이름</label>
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">이메일</label>
        <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">팀</label>
        <Input value={form.team} onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">역할</label>
        <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Admin">Admin</SelectItem>
            <SelectItem value="PI">PI</SelectItem>
            <SelectItem value="Researcher">Researcher</SelectItem>
            <SelectItem value="Viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setAddUserOpen(false)}>취소</Button>
      <Button
        className="gradient-primary text-primary-foreground"
        disabled={!form.name || !form.email || createUserMutation.isPending}
        onClick={() => createUserMutation.mutate(form)}
      >
        {createUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '추가'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run src/pages/AdminPage.test.tsx
```
Expected: all 3 tests PASS

- [ ] **Step 10: Run all tests**

```bash
npx vitest run
```
Expected: all tests PASS (no regressions)

- [ ] **Step 11: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 12: Commit**

```bash
git add src/pages/AdminPage.tsx src/pages/AdminPage.test.tsx
git commit -m "feat: wire AdminPage to real API — replace mock data with useQuery/useMutation"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS

- [ ] **Run lint**

```bash
npm run lint
```
Expected: no errors

- [ ] **Final commit if any lint fixes needed**

```bash
git add -p
git commit -m "chore: lint fixes"
```
