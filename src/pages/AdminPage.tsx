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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users, Building2, Building, Shield, Plus, Settings, Loader2, MoreHorizontal } from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "@/hooks/use-toast";
import {
  listUsers, createUser, updateUser, deleteUser,
  listTeams, createTeam, updateTeam, deleteTeam,
  listOrgs, createOrg, updateOrg, deleteOrg,
  listRoles,
} from "@/api/admin";
import type { AdminOrg, AdminUser, AdminTeam, AdminRole, CreateUserPayload, UpdateUserPayload } from "@/api/admin";

export default function AdminPage() {
  const qc = useQueryClient();

  // ─── 사용자 상태 ──────────────────────────────────
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState<CreateUserPayload>({ name: '', email: '', password: '', roleId: '' });
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [userEditForm, setUserEditForm] = useState<UpdateUserPayload>({ name: '', roleId: '' });
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUser | null>(null);

  // ─── 팀 상태 ─────────────────────────────────────
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<AdminTeam | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', orgId: '' });
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<AdminTeam | null>(null);

  // ─── 조직 상태 ────────────────────────────────────
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<AdminOrg | null>(null);
  const [orgForm, setOrgForm] = useState({ name: '', slug: '' });
  const [deleteOrgTarget, setDeleteOrgTarget] = useState<AdminOrg | null>(null);

  // ─── Queries ─────────────────────────────────────

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

  const orgsQuery = useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => {
      const res = await listOrgs();
      if (!res.ok) throw new Error(res.error ?? '조직 목록 조회 실패');
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

  // ─── 사용자 Mutations ─────────────────────────────

  const createUserMutation = useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await createUser(payload);
      if (!res.ok) throw new Error(res.error ?? '사용자 추가에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      toast({ title: '사용자 추가 완료' });
      setAddUserOpen(false);
      setNewUserForm({ name: '', email: '', password: '', roleId: '' });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => {
      toast({ title: '사용자 추가 실패', description: err.message, variant: 'destructive' });
    },
  });

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

  // ─── 팀 Mutations ─────────────────────────────────

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

  // ─── 조직 Mutations ───────────────────────────────

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

  // ─── 렌더 ─────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          관리
          <HelpTooltip text="조직의 사용자, 팀, 조직, 역할/권한, 시스템 설정을 관리하는 관리자 전용 화면입니다." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">조직, 팀, 사용자 및 권한 관리</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> 사용자</TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> 팀</TabsTrigger>
          <TabsTrigger value="orgs" className="gap-1.5"><Building className="h-3.5 w-3.5" /> 조직</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> 역할/권한</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> 설정</TabsTrigger>
        </TabsList>

        {/* ── 사용자 탭 ── */}
        <TabsContent value="users" className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                사용자 목록
                <HelpTooltip text="조직에 등록된 모든 사용자를 관리합니다. 사용자 추가, 역할 변경, 삭제 등이 가능합니다." />
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
                      <TableHead className="flex items-center gap-1">역할 <HelpTooltip text="Admin: 전체 관리, PI: 서명 및 팀 관리, Researcher: 실험 기록, Viewer: 읽기 전용" /></TableHead>
                      <TableHead>팀</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersQuery.data.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{u.role ?? '—'}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{u.team ?? '—'}</TableCell>
                        <TableCell><Badge className="text-[10px] bg-success/10 text-success">{u.status}</Badge></TableCell>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 팀 탭 ── */}
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
              {teamsQuery.isLoading && (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
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

        {/* ── 조직 탭 ── */}
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
              {orgsQuery.isLoading && (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
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

        {/* ── 역할/권한 탭 ── */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          {rolesQuery.isLoading && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {rolesQuery.isError && (
            <div className="text-sm text-destructive p-4">
              {(rolesQuery.error as Error).message}
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => rolesQuery.refetch()}>다시 시도</Button>
            </div>
          )}
          {rolesQuery.data && (rolesQuery.data as AdminRole[]).map((r) => (
            <Card key={r.id ?? r.name} className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{r.name}</h3>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {r.permissions.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}
                    </div>
                  </div>
                  {r.userCount != null && <span className="text-sm text-muted-foreground">{r.userCount}명</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── 설정 탭 ── */}
        <TabsContent value="settings" className="mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                시스템 설정
                <HelpTooltip text="조직명, SSO 연동, 언어, 저장소 등 시스템 전반의 설정을 관리합니다. 백엔드 연동 후 변경이 활성화됩니다." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">조직 이름</label>
                  <Input value="BioLab 연구소" readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">SSO 설정</label>
                  <Input value="Keycloak (미연결)" readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">기본 언어</label>
                  <Input value="한국어" readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">파일 저장소</label>
                  <Input value="MinIO (내부)" readOnly />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">※ 설정 변경은 백엔드 연동 후 활성화됩니다 (TODO)</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════
          사용자 다이얼로그
      ════════════════════════════════════════ */}

      {/* 사용자 추가 */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용자 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">이름</label>
              <Input value={newUserForm.name} onChange={(e) => setNewUserForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">이메일</label>
              <Input type="email" value={newUserForm.email} onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">비밀번호</label>
              <Input type="password" value={newUserForm.password} onChange={(e) => setNewUserForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">역할</label>
              <Select value={newUserForm.roleId ?? ''} onValueChange={(v) => setNewUserForm((f) => ({ ...f, roleId: v }))}>
                <SelectTrigger><SelectValue placeholder="역할 선택" /></SelectTrigger>
                <SelectContent>
                  {(rolesQuery.data as AdminRole[] | undefined)?.map((r) => (
                    <SelectItem key={r.id ?? r.name} value={r.id ?? r.name}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>취소</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={!newUserForm.name || !newUserForm.email || !newUserForm.password || createUserMutation.isPending}
              onClick={() => createUserMutation.mutate(newUserForm)}
            >
              {createUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 사용자 수정 */}
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
                  {(rolesQuery.data as AdminRole[] | undefined)?.map((r) => (
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

      {/* 사용자 삭제 */}
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

      {/* ════════════════════════════════════════
          팀 다이얼로그
      ════════════════════════════════════════ */}

      {/* 팀 생성/수정 */}
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

      {/* 팀 삭제 */}
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

      {/* ════════════════════════════════════════
          조직 다이얼로그
      ════════════════════════════════════════ */}

      {/* 조직 생성/수정 */}
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

      {/* 조직 삭제 */}
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
    </div>
  );
}
