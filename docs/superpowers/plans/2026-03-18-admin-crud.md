# Admin CRUD Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리 페이지에서 조직/팀/사용자 CRUD를 실제 auth-service API와 연동하여 동작하게 한다.

**Architecture:** `src/api/admin.ts`에 누락된 CRUD 함수(org/team/user)를 추가하고, `src/pages/AdminPage.tsx`에 조직 탭 신설 + 팀/사용자 탭에 수정·삭제 기능을 모달+AlertDialog 패턴으로 구현한다.

**Tech Stack:** React, TanStack Query, shadcn/ui (Dialog, AlertDialog, DropdownMenu, Table), Vitest, @testing-library/react

---

## File Map

| 파일 | 작업 |
|------|------|
| `src/api/admin.ts` | `AdminOrg` 인터페이스 + org/team/user CRUD 함수 추가 |
| `src/api/admin.test.ts` | 경로 수정 + 신규 함수 테스트 추가 |
| `src/pages/AdminPage.tsx` | 조직 탭 신설, 팀 탭 테이블화+CRUD, 사용자 탭 수정·삭제 추가 |
| `src/pages/AdminPage.test.tsx` | 새 CRUD 인터랙션 테스트 추가 |

---

## Task 1: admin.ts — 누락 API 함수 추가

**Files:**
- Modify: `src/api/admin.ts`

### 1-1. `AdminOrg` 인터페이스 + org CRUD 추가

- [ ] **`src/api/admin.ts` 상단에 `AdminOrg` 인터페이스 추가**

```ts
export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
}
```

- [ ] **`listOrgs`, `createOrg`, `updateOrg`, `deleteOrg` 함수 추가**

```ts
export async function listOrgs(): Promise<ApiResponse<AdminOrg[]>> {
  try {
    return await apiClient.get<AdminOrg[]>('/auth/orgs');
  } catch {
    return { ok: false, data: [] as AdminOrg[], error: '조직 목록 조회에 실패했습니다.' };
  }
}

export async function createOrg(payload: { name: string; slug: string }): Promise<ApiResponse<AdminOrg>> {
  try {
    return await apiClient.post<AdminOrg>('/auth/orgs', payload);
  } catch {
    return { ok: false, data: null as unknown as AdminOrg, error: '조직 생성에 실패했습니다.' };
  }
}

export async function updateOrg(id: string, payload: { name?: string; slug?: string }): Promise<ApiResponse<AdminOrg>> {
  try {
    return await apiClient.put<AdminOrg>(`/auth/orgs/${id}`, payload);
  } catch {
    return { ok: false, data: null as unknown as AdminOrg, error: '조직 수정에 실패했습니다.' };
  }
}

export async function deleteOrg(id: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.delete<void>(`/auth/orgs/${id}`);
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '조직 삭제에 실패했습니다.' };
  }
}
```

### 1-2. team CRUD 추가

- [ ] **`createTeam`, `updateTeam`, `deleteTeam` 함수 추가**

```ts
export async function createTeam(payload: { orgId: string; name: string }): Promise<ApiResponse<AdminTeam>> {
  try {
    return await apiClient.post<AdminTeam>('/auth/teams', payload);
  } catch {
    return { ok: false, data: null as unknown as AdminTeam, error: '팀 생성에 실패했습니다.' };
  }
}

export async function updateTeam(id: string, payload: { name: string }): Promise<ApiResponse<AdminTeam>> {
  try {
    return await apiClient.put<AdminTeam>(`/auth/teams/${id}`, payload);
  } catch {
    return { ok: false, data: null as unknown as AdminTeam, error: '팀 수정에 실패했습니다.' };
  }
}

export async function deleteTeam(id: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.delete<void>(`/auth/teams/${id}`);
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '팀 삭제에 실패했습니다.' };
  }
}
```

### 1-3. user 수정·삭제 추가

- [ ] **`UpdateUserPayload` 인터페이스 + `updateUser`, `deleteUser` 함수 추가**

```ts
export interface UpdateUserPayload {
  name?: string;
  roleId?: string;
  status?: string;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<ApiResponse<AdminUser>> {
  try {
    return await apiClient.put<AdminUser>(`/auth/users/${id}`, payload);
  } catch {
    return { ok: false, data: null as unknown as AdminUser, error: '사용자 수정에 실패했습니다.' };
  }
}

export async function deleteUser(id: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.delete<void>(`/auth/users/${id}`);
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '사용자 삭제에 실패했습니다.' };
  }
}
```

---

## Task 2: admin.test.ts — 경로 수정 + 신규 함수 테스트

**Files:**
- Modify: `src/api/admin.test.ts`

- [ ] **기존 테스트 경로 `/admin/*` → `/auth/*` 로 수정**

  `admin.test.ts`에서 아래 세 줄 수정:
  ```ts
  expect(getSpy).toHaveBeenCalledWith('/auth/users');   // was '/admin/users'
  expect(postSpy).toHaveBeenCalledWith('/auth/users', payload); // was '/admin/users'
  expect(getSpy).toHaveBeenCalledWith('/auth/teams');   // was '/admin/teams'
  // listRoles 경로도 '/auth/roles' 로
  ```

  `createUser` payload도 `{ name, email, password, roleId }` 형태로 수정:
  ```ts
  const payload = { name: '홍길동', email: 'hong@lab.kr', password: 'pw', roleId: '' };
  ```

- [ ] **신규 함수 테스트 추가** (기존 `describe` 블록 안에 추가)

```ts
it('listOrgs calls GET /auth/orgs', async () => {
  getSpy.mockResolvedValue({ ok: true, data: [] });
  const { listOrgs } = await import('@/api/admin');
  await listOrgs();
  expect(getSpy).toHaveBeenCalledWith('/auth/orgs');
});

it('createOrg calls POST /auth/orgs', async () => {
  postSpy.mockResolvedValue({ ok: true, data: {} });
  const { createOrg } = await import('@/api/admin');
  await createOrg({ name: '테스트조직', slug: 'test-org' });
  expect(postSpy).toHaveBeenCalledWith('/auth/orgs', { name: '테스트조직', slug: 'test-org' });
});

it('createTeam calls POST /auth/teams', async () => {
  postSpy.mockResolvedValue({ ok: true, data: {} });
  const { createTeam } = await import('@/api/admin');
  await createTeam({ orgId: 'org1', name: '신규팀' });
  expect(postSpy).toHaveBeenCalledWith('/auth/teams', { orgId: 'org1', name: '신규팀' });
});

it('deleteUser calls DELETE /auth/users/:id', async () => {
  const deleteSpy = vi.spyOn(clientModule.apiClient, 'delete');
  deleteSpy.mockResolvedValue({ ok: true, data: undefined });
  const { deleteUser } = await import('@/api/admin');
  await deleteUser('u1');
  expect(deleteSpy).toHaveBeenCalledWith('/auth/users/u1');
});
```

- [ ] **테스트 실행 후 전부 통과 확인**

  ```bash
  npx vitest run src/api/admin.test.ts
  ```
  Expected: 모든 테스트 PASS

- [ ] **커밋**

  ```bash
  git add src/api/admin.ts src/api/admin.test.ts
  git commit -m "feat(admin): add org/team/user CRUD API functions"
  ```

---

## Task 3: AdminPage — 조직 탭 신설

**Files:**
- Modify: `src/pages/AdminPage.tsx`

AdminPage.tsx를 전체 재작성한다. 구조가 크게 바뀌어 Edit보다 통째로 교체가 명확하다.

### 3-1. import 추가

- [ ] **파일 상단 import에 아래 항목 추가**

```tsx
import { MoreHorizontal, Building } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listOrgs, createOrg, updateOrg, deleteOrg,
  createTeam, updateTeam, deleteTeam,
  updateUser, deleteUser,
} from "@/api/admin";
import type { AdminOrg, AdminTeam, UpdateUserPayload } from "@/api/admin";
```

### 3-2. 조직 탭 상태 추가

- [ ] **컴포넌트 내 상태 선언부에 조직 관련 상태 추가**

```tsx
// 조직
const [orgDialogOpen, setOrgDialogOpen] = useState(false);
const [editOrg, setEditOrg] = useState<AdminOrg | null>(null);
const [orgForm, setOrgForm] = useState({ name: '', slug: '' });
const [deleteOrgTarget, setDeleteOrgTarget] = useState<AdminOrg | null>(null);
```

### 3-3. 조직 Query + Mutations 추가

- [ ] **조직 useQuery 추가**

```tsx
const orgsQuery = useQuery({
  queryKey: ['admin', 'orgs'],
  queryFn: async () => {
    const res = await listOrgs();
    if (!res.ok) throw new Error(res.error ?? '조직 목록 조회 실패');
    return res.data;
  },
});
```

- [ ] **조직 create/update/delete mutation 추가**

```tsx
const orgMutation = useMutation({
  mutationFn: async (values: { name: string; slug: string }) => {
    const res = editOrg
      ? await updateOrg(editOrg.id, values)
      : await createOrg(values);
    if (!res.ok) throw new Error(res.error ?? '저장 실패');
    return res.data;
  },
  onSuccess: () => {
    toast({ title: editOrg ? '조직 수정 완료' : '조직 추가 완료' });
    setOrgDialogOpen(false);
    setEditOrg(null);
    setOrgForm({ name: '', slug: '' });
    qc.invalidateQueries({ queryKey: ['admin', 'orgs'] });
  },
  onError: (err: Error) => {
    toast({ title: '저장 실패', description: err.message, variant: 'destructive' });
  },
});

const deleteOrgMutation = useMutation({
  mutationFn: async (id: string) => {
    const res = await deleteOrg(id);
    if (!res.ok) throw new Error(res.error ?? '삭제 실패');
  },
  onSuccess: () => {
    toast({ title: '조직 삭제 완료' });
    setDeleteOrgTarget(null);
    qc.invalidateQueries({ queryKey: ['admin', 'orgs'] });
  },
  onError: (err: Error) => {
    toast({ title: '삭제 실패', description: err.message, variant: 'destructive' });
  },
});
```

### 3-4. TabsList에 조직 탭 추가

- [ ] **TabsList 항목 순서를 `사용자 → 팀 → 조직 → 역할/권한 → 설정`으로 변경**

```tsx
<TabsList>
  <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> 사용자</TabsTrigger>
  <TabsTrigger value="teams" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> 팀</TabsTrigger>
  <TabsTrigger value="orgs" className="gap-1.5"><Building className="h-3.5 w-3.5" /> 조직</TabsTrigger>
  <TabsTrigger value="roles" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> 역할/권한</TabsTrigger>
  <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> 설정</TabsTrigger>
</TabsList>
```

### 3-5. 조직 TabsContent 추가

- [ ] **`<TabsContent value="orgs">` 블록 추가** — 팀 탭 바로 다음에 삽입

```tsx
<TabsContent value="orgs" className="mt-4">
  <Card className="shadow-card">
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-base">조직 목록</CardTitle>
      <Button size="sm" className="gradient-primary text-primary-foreground gap-1"
        onClick={() => { setEditOrg(null); setOrgForm({ name: '', slug: '' }); setOrgDialogOpen(true); }}>
        <Plus className="h-3.5 w-3.5" /> 조직 추가
      </Button>
    </CardHeader>
    <CardContent className="p-0">
      {orgsQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {orgsQuery.isError && (
        <div className="p-4 text-sm text-destructive">
          {(orgsQuery.error as Error).message}
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => orgsQuery.refetch()}>다시 시도</Button>
        </div>
      )}
      {orgsQuery.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>슬러그</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgsQuery.data.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-muted-foreground">{o.slug}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setEditOrg(o);
                        setOrgForm({ name: o.name, slug: o.slug });
                        setOrgDialogOpen(true);
                      }}>수정</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOrgTarget(o)}>
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

### 3-6. 조직 다이얼로그 + AlertDialog 추가

- [ ] **조직 생성/수정 Dialog 추가** (기존 사용자 Dialog 바로 아래)

```tsx
{/* 조직 생성/수정 Dialog */}
<Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{editOrg ? '조직 수정' : '조직 추가'}</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <label className="text-sm font-medium">조직 이름</label>
        <Input value={orgForm.name} onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">슬러그</label>
        <Input value={orgForm.slug} onChange={(e) => setOrgForm((f) => ({ ...f, slug: e.target.value }))} placeholder="my-org" />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOrgDialogOpen(false)}>취소</Button>
      <Button
        className="gradient-primary text-primary-foreground"
        disabled={!orgForm.name || !orgForm.slug || orgMutation.isPending}
        onClick={() => orgMutation.mutate(orgForm)}
      >
        {orgMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editOrg ? '저장' : '추가')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* 조직 삭제 AlertDialog */}
<AlertDialog open={!!deleteOrgTarget} onOpenChange={(o) => !o && setDeleteOrgTarget(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>조직 삭제</AlertDialogTitle>
      <AlertDialogDescription>
        <strong>{deleteOrgTarget?.name}</strong> 조직을 삭제하시겠습니까? 소속 사용자가 없어야 삭제할 수 있습니다.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>취소</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => deleteOrgTarget && deleteOrgMutation.mutate(deleteOrgTarget.id)}
      >
        삭제
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Task 4: AdminPage — 팀 탭 CRUD

**Files:**
- Modify: `src/pages/AdminPage.tsx`

### 4-1. 팀 상태 추가

- [ ] **팀 CRUD 관련 상태 추가**

```tsx
const [teamDialogOpen, setTeamDialogOpen] = useState(false);
const [editTeam, setEditTeam] = useState<AdminTeam | null>(null);
const [teamForm, setTeamForm] = useState({ name: '', orgId: '' });
const [deleteTeamTarget, setDeleteTeamTarget] = useState<AdminTeam | null>(null);
```

### 4-2. 팀 Mutations 추가

- [ ] **팀 create/update/delete mutation 추가**

```tsx
const teamMutation = useMutation({
  mutationFn: async (values: { name: string; orgId: string }) => {
    const res = editTeam
      ? await updateTeam(editTeam.id, { name: values.name })
      : await createTeam(values);
    if (!res.ok) throw new Error(res.error ?? '저장 실패');
    return res.data;
  },
  onSuccess: () => {
    toast({ title: editTeam ? '팀 수정 완료' : '팀 추가 완료' });
    setTeamDialogOpen(false);
    setEditTeam(null);
    setTeamForm({ name: '', orgId: '' });
    qc.invalidateQueries({ queryKey: ['admin', 'teams'] });
  },
  onError: (err: Error) => {
    toast({ title: '저장 실패', description: err.message, variant: 'destructive' });
  },
});

const deleteTeamMutation = useMutation({
  mutationFn: async (id: string) => {
    const res = await deleteTeam(id);
    if (!res.ok) throw new Error(res.error ?? '삭제 실패');
  },
  onSuccess: () => {
    toast({ title: '팀 삭제 완료' });
    setDeleteTeamTarget(null);
    qc.invalidateQueries({ queryKey: ['admin', 'teams'] });
  },
  onError: (err: Error) => {
    toast({ title: '삭제 실패', description: err.message, variant: 'destructive' });
  },
});
```

### 4-3. 팀 탭 내용 교체 (카드→테이블)

- [ ] **팀 TabsContent를 카드 목록에서 테이블+CRUD로 교체**

```tsx
<TabsContent value="teams" className="mt-4">
  <Card className="shadow-card">
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-base">팀 목록</CardTitle>
      <Button size="sm" className="gradient-primary text-primary-foreground gap-1"
        onClick={() => {
          setEditTeam(null);
          setTeamForm({ name: '', orgId: orgsQuery.data?.[0]?.id ?? '' });
          setTeamDialogOpen(true);
        }}>
        <Plus className="h-3.5 w-3.5" /> 팀 추가
      </Button>
    </CardHeader>
    <CardContent className="p-0">
      {teamsQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {teamsQuery.isError && (
        <div className="p-4 text-sm text-destructive">
          {(teamsQuery.error as Error).message}
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => teamsQuery.refetch()}>다시 시도</Button>
        </div>
      )}
      {teamsQuery.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>팀 이름</TableHead>
              <TableHead>인원</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamsQuery.data.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-muted-foreground">{t.memberCount}명</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setEditTeam(t);
                        setTeamForm({ name: t.name, orgId: '' });
                        setTeamDialogOpen(true);
                      }}>수정</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTeamTarget(t)}>
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

### 4-4. 팀 Dialog + AlertDialog 추가

- [ ] **팀 생성/수정 Dialog 추가**

```tsx
{/* 팀 생성/수정 Dialog */}
<Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{editTeam ? '팀 수정' : '팀 추가'}</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <label className="text-sm font-medium">팀 이름</label>
        <Input value={teamForm.name} onChange={(e) => setTeamForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      {!editTeam && (
        <div className="space-y-1">
          <label className="text-sm font-medium">조직</label>
          <Select value={teamForm.orgId} onValueChange={(v) => setTeamForm((f) => ({ ...f, orgId: v }))}>
            <SelectTrigger><SelectValue placeholder="조직 선택" /></SelectTrigger>
            <SelectContent>
              {orgsQuery.data?.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setTeamDialogOpen(false)}>취소</Button>
      <Button
        className="gradient-primary text-primary-foreground"
        disabled={!teamForm.name || teamMutation.isPending}
        onClick={() => teamMutation.mutate(teamForm)}
      >
        {teamMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editTeam ? '저장' : '추가')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* 팀 삭제 AlertDialog */}
<AlertDialog open={!!deleteTeamTarget} onOpenChange={(o) => !o && setDeleteTeamTarget(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>팀 삭제</AlertDialogTitle>
      <AlertDialogDescription>
        <strong>{deleteTeamTarget?.name}</strong> 팀을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>취소</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => deleteTeamTarget && deleteTeamMutation.mutate(deleteTeamTarget.id)}
      >
        삭제
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Task 5: AdminPage — 사용자 탭 수정·삭제

**Files:**
- Modify: `src/pages/AdminPage.tsx`

### 5-1. 사용자 수정·삭제 상태 추가

- [ ] **사용자 편집 관련 상태 추가**

```tsx
const [editUser, setEditUser] = useState<AdminUser | null>(null);
const [userEditForm, setUserEditForm] = useState<UpdateUserPayload>({ name: '', roleId: '' });
const [editUserOpen, setEditUserOpen] = useState(false);
const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUser | null>(null);
```

### 5-2. 사용자 update/delete mutation 추가

- [ ] **사용자 update/delete mutation 추가**

```tsx
const updateUserMutation = useMutation({
  mutationFn: async (values: UpdateUserPayload) => {
    const res = await updateUser(editUser!.id, values);
    if (!res.ok) throw new Error(res.error ?? '수정 실패');
    return res.data;
  },
  onSuccess: () => {
    toast({ title: '사용자 수정 완료' });
    setEditUserOpen(false);
    setEditUser(null);
    qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  },
  onError: (err: Error) => {
    toast({ title: '수정 실패', description: err.message, variant: 'destructive' });
  },
});

const deleteUserMutation = useMutation({
  mutationFn: async (id: string) => {
    const res = await deleteUser(id);
    if (!res.ok) throw new Error(res.error ?? '삭제 실패');
  },
  onSuccess: () => {
    toast({ title: '사용자 삭제 완료' });
    setDeleteUserTarget(null);
    qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  },
  onError: (err: Error) => {
    toast({ title: '삭제 실패', description: err.message, variant: 'destructive' });
  },
});
```

### 5-3. 사용자 테이블 행에 DropdownMenu 추가

- [ ] **기존 사용자 테이블의 `<TableHead>` 마지막에 빈 헤더 추가**

```tsx
<TableHead className="w-12" />
```

- [ ] **각 사용자 행 마지막 `<TableCell>`에 DropdownMenu 추가**

```tsx
<TableCell>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => {
        setEditUser(u);
        setUserEditForm({ name: u.name, roleId: '' });
        setEditUserOpen(true);
      }}>수정</DropdownMenuItem>
      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteUserTarget(u)}>
        삭제
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</TableCell>
```

### 5-4. 사용자 수정 Dialog + 삭제 AlertDialog 추가

- [ ] **사용자 수정 Dialog 추가**

```tsx
{/* 사용자 수정 Dialog */}
<Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>사용자 수정</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <label className="text-sm font-medium">이름</label>
        <Input value={userEditForm.name ?? ''} onChange={(e) => setUserEditForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">역할</label>
        <Select value={userEditForm.roleId ?? ''} onValueChange={(v) => setUserEditForm((f) => ({ ...f, roleId: v }))}>
          <SelectTrigger><SelectValue placeholder="역할 선택" /></SelectTrigger>
          <SelectContent>
            {rolesQuery.data?.map((r) => (
              <SelectItem key={r.id ?? r.name} value={r.id ?? r.name}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setEditUserOpen(false)}>취소</Button>
      <Button
        className="gradient-primary text-primary-foreground"
        disabled={updateUserMutation.isPending}
        onClick={() => updateUserMutation.mutate(userEditForm)}
      >
        {updateUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '저장'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* 사용자 삭제 AlertDialog */}
<AlertDialog open={!!deleteUserTarget} onOpenChange={(o) => !o && setDeleteUserTarget(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>사용자 삭제</AlertDialogTitle>
      <AlertDialogDescription>
        <strong>{deleteUserTarget?.name}</strong>({deleteUserTarget?.email}) 사용자를 삭제하시겠습니까?
        이 작업은 되돌릴 수 없습니다.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>취소</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => deleteUserTarget && deleteUserMutation.mutate(deleteUserTarget.id)}
      >
        삭제
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Task 6: AdminPage.test.tsx — CRUD 인터랙션 테스트 추가 및 경로 수정

**Files:**
- Modify: `src/pages/AdminPage.test.tsx`

- [ ] **AdminPage.test.tsx 상단 mock 데이터에 orgs 추가**

```ts
const mockOrgs: admin.AdminOrg[] = [
  { id: 'org1', name: 'BioLab', slug: 'biolab' },
];
```

- [ ] **기존 테스트들의 `listOrgs` mock 추가** — 각 `beforeEach` 또는 `it` 안에서

```ts
vi.spyOn(admin, 'listOrgs').mockResolvedValue({ ok: true, data: mockOrgs });
```

- [ ] **사용자 수정 테스트 추가**

```ts
it('opens edit user dialog on dropdown menu click', async () => {
  vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: true, data: mockUsers });
  vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: mockTeams });
  vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: mockRoles });
  vi.spyOn(admin, 'listOrgs').mockResolvedValue({ ok: true, data: mockOrgs });

  render(<AdminPage />, { wrapper });
  await waitFor(() => expect(screen.getByText('김연구')).toBeInTheDocument());

  // open dropdown
  fireEvent.click(screen.getAllByRole('button', { name: '' })[0]);
  await waitFor(() => expect(screen.getByText('수정')).toBeInTheDocument());
  fireEvent.click(screen.getByText('수정'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  expect(screen.getByText('사용자 수정')).toBeInTheDocument();
});
```

- [ ] **사용자 삭제 확인 다이얼로그 테스트 추가**

```ts
it('shows delete confirmation dialog', async () => {
  vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: true, data: mockUsers });
  vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: mockTeams });
  vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: mockRoles });
  vi.spyOn(admin, 'listOrgs').mockResolvedValue({ ok: true, data: mockOrgs });

  render(<AdminPage />, { wrapper });
  await waitFor(() => expect(screen.getByText('김연구')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: '' })[0]);
  await waitFor(() => expect(screen.getByText('삭제')).toBeInTheDocument());
  fireEvent.click(screen.getByText('삭제'));
  await waitFor(() => expect(screen.getByText('사용자 삭제')).toBeInTheDocument());
  expect(screen.getByText(/삭제하시겠습니까/)).toBeInTheDocument();
});
```

- [ ] **테스트 실행 후 전부 통과 확인**

  ```bash
  npx vitest run src/pages/AdminPage.test.tsx
  ```
  Expected: 모든 테스트 PASS

- [ ] **최종 커밋**

  ```bash
  git add src/pages/AdminPage.tsx src/pages/AdminPage.test.tsx
  git commit -m "feat(admin): add org/team/user CRUD UI with modals and delete confirmation"
  ```
