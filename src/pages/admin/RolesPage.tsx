import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Loader2, MoreHorizontal } from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "@/hooks/use-toast";
import { listOrgs, listRoles, createRole, updateRolePermissions, deleteRole } from "@/api/admin";
import type { AdminRole } from "@/api/admin";

const ALL_PERMISSIONS = [
  'note:read','note:write','note:sign','note:delete',
  'template:read','template:write',
  'inventory:read','inventory:write',
  'scheduler:read','scheduler:write',
  'audit:read','admin',
];

export default function RolesPage() {
  const qc = useQueryClient();

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<AdminRole | null>(null);
  const [roleForm, setRoleForm] = useState({ name: '', permissions: [] as string[] });
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<AdminRole | null>(null);

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const res = await listRoles();
      if (!res.ok) throw new Error(res.error ?? '역할 목록 조회 실패');
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

  const roleMutation = useMutation({
    mutationFn: async (values: { name: string; permissions: string[] }) => {
      if (editRole) {
        const res = await updateRolePermissions(editRole.id!, values.permissions);
        if (!res.ok) throw new Error(res.error ?? '권한 수정 실패');
        return res.data;
      }
      const orgId = orgsQuery.data?.[0]?.id;
      if (!orgId) throw new Error('조직이 없습니다. 먼저 조직을 생성해주세요.');
      const res = await createRole({ orgId, name: values.name, permissions: values.permissions });
      if (!res.ok) throw new Error(res.error ?? '역할 생성 실패');
      return res.data;
    },
    onSuccess: () => {
      toast({ title: editRole ? '권한 수정 완료' : '역할 생성 완료' });
      setRoleDialogOpen(false);
      setEditRole(null);
      setRoleForm({ name: '', permissions: [] });
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (err: Error) => toast({ title: '저장 실패', description: err.message, variant: 'destructive' }),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteRole(id);
      if (!res.ok) throw new Error(res.error ?? '삭제 실패');
    },
    onSuccess: () => {
      toast({ title: '역할 삭제 완료' });
      setDeleteRoleTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (err: Error) => toast({ title: '삭제 실패', description: err.message, variant: 'destructive' }),
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            역할 / 권한
            <HelpTooltip text="역할별 권한을 관리합니다. 역할 추가, 권한 수정, 삭제가 가능합니다." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">역할별 권한 설정 관리</p>
        </div>
        <Button size="sm" className="gradient-primary text-primary-foreground gap-1"
          onClick={() => { setEditRole(null); setRoleForm({ name: '', permissions: [] }); setRoleDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> 역할 추가
        </Button>
      </div>

      <div className="space-y-3">
        {rolesQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {rolesQuery.isError && (
          <div className="text-sm text-destructive p-4">
            {(rolesQuery.error as Error).message}
            <Button variant="ghost" size="sm" className="ml-2" onClick={() => rolesQuery.refetch()}>다시 시도</Button>
          </div>
        )}
        {(rolesQuery.data as AdminRole[] | undefined)?.map((r) => (
          <Card key={r.id ?? r.name} className="shadow-card">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{r.name}</h3>
                    {r.userCount != null && (
                      <span className="text-xs text-muted-foreground">{r.userCount}명 사용 중</span>
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {r.permissions.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}
                    {r.permissions.length === 0 && <span className="text-xs text-muted-foreground">권한 없음</span>}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      setEditRole(r);
                      setRoleForm({ name: r.name, permissions: [...r.permissions] });
                      setRoleDialogOpen(true);
                    }}>권한 수정</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteRoleTarget(r)}>삭제</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ════ 역할 생성/권한 수정 ════ */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editRole ? `권한 수정 — ${editRole.name}` : '역할 추가'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {!editRole && (
              <div className="space-y-1">
                <label className="text-sm font-medium">역할 이름 *</label>
                <Input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: Researcher" />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">권한 선택</label>
              <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
                {ALL_PERMISSIONS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm cursor-pointer select-none rounded px-2 py-1.5 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={roleForm.permissions.includes(p)}
                      onChange={(e) => setRoleForm((f) => ({
                        ...f,
                        permissions: e.target.checked
                          ? [...f.permissions, p]
                          : f.permissions.filter((x) => x !== p),
                      }))}
                    />
                    <span className="font-mono text-xs">{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>취소</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={(!editRole && !roleForm.name) || roleMutation.isPending}
              onClick={() => roleMutation.mutate(roleForm)}
            >
              {roleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editRole ? '저장' : '추가')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ 역할 삭제 ════ */}
      <AlertDialog open={!!deleteRoleTarget} onOpenChange={(o) => !o && setDeleteRoleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>역할 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteRoleTarget?.name}</strong> 역할을 삭제하시겠습니까?
              이 역할이 지정된 사용자가 없어야 삭제할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRoleTarget?.id && deleteRoleMutation.mutate(deleteRoleTarget.id)}
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
