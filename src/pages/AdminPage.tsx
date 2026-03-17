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

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          관리
          <HelpTooltip text="조직의 사용자, 팀, 역할/권한, 시스템 설정을 관리하는 관리자 전용 화면입니다." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">조직, 팀, 사용자 및 권한 관리</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> 사용자</TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> 팀</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> 역할/권한</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> 설정</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                사용자 목록
                <HelpTooltip text="조직에 등록된 모든 사용자를 관리합니다. 사용자 추가, 역할 변경, 팀 배정 등이 가능합니다." />
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

        <TabsContent value="teams" className="mt-4">
          {teamsQuery.isLoading && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {teamsQuery.isError && (
            <div className="text-sm text-destructive p-4">
              {(teamsQuery.error as Error).message}
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => teamsQuery.refetch()}>다시 시도</Button>
            </div>
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
          {rolesQuery.data && rolesQuery.data.map((r) => (
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
    </div>
  );
}
