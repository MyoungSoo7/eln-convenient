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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');

  const qc = useQueryClient();

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<AdminRole | null>(null);
  const [roleForm, setRoleForm] = useState({ name: '', permissions: [] as string[] });
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<AdminRole | null>(null);

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const res = await listRoles();
      if (!res.ok) throw new Error(res.error ?? t('roles.loadFailed'));
      return res.data;
    },
  });

  const orgsQuery = useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => {
      const res = await listOrgs();
      if (!res.ok) throw new Error(res.error ?? t('roles.loadOrgsFailed'));
      return res.data;
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (values: { name: string; permissions: string[] }) => {
      if (editRole) {
        const res = await updateRolePermissions(editRole.id!, values.permissions);
        if (!res.ok) throw new Error(res.error ?? t('roles.updatePermissionsFailed'));
        return res.data;
      }
      const orgId = orgsQuery.data?.[0]?.id;
      if (!orgId) throw new Error(t('roles.noOrgError'));
      const res = await createRole({ orgId, name: values.name, permissions: values.permissions });
      if (!res.ok) throw new Error(res.error ?? t('roles.createFailed'));
      return res.data;
    },
    onSuccess: () => {
      toast({ title: editRole ? t('roles.permissionsUpdated') : t('roles.roleCreated') });
      setRoleDialogOpen(false);
      setEditRole(null);
      setRoleForm({ name: '', permissions: [] });
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (err: Error) => toast({ title: t('roles.saveFailed'), description: err.message, variant: 'destructive' }),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteRole(id);
      if (!res.ok) throw new Error(res.error ?? t('roles.deleteFailed'));
    },
    onSuccess: () => {
      toast({ title: t('roles.roleDeleted') });
      setDeleteRoleTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (err: Error) => toast({ title: t('roles.deleteFailed'), description: err.message, variant: 'destructive' }),
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {t('roles.title')}
            <HelpTooltip text={t('roles.titleTooltip')} />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('roles.subtitle')}</p>
        </div>
        <Button size="sm" className="gradient-primary text-primary-foreground gap-1"
          onClick={() => { setEditRole(null); setRoleForm({ name: '', permissions: [] }); setRoleDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> {t('roles.addRole')}
        </Button>
      </div>

      <div className="space-y-3">
        {rolesQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {rolesQuery.isError && (
          <div className="text-sm text-destructive p-4">
            {(rolesQuery.error as Error).message}
            <Button variant="ghost" size="sm" className="ml-2" onClick={() => rolesQuery.refetch()}>{tc('retry')}</Button>
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
                      <span className="text-xs text-muted-foreground">{t('roles.userCount', { count: r.userCount })}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {r.permissions.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}
                    {r.permissions.length === 0 && <span className="text-xs text-muted-foreground">{t('roles.noPermissions')}</span>}
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
                    }}>{t('roles.editPermissions')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteRoleTarget(r)}>{tc('delete')}</DropdownMenuItem>
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
          <DialogHeader><DialogTitle>{editRole ? t('roles.editRoleTitle', { name: editRole.name }) : t('roles.addRoleTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {!editRole && (
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('roles.roleNameLabel')} *</label>
                <Input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('roles.roleNamePlaceholder')} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('roles.permissionSelect')}</label>
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
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>{tc('cancel')}</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={(!editRole && !roleForm.name) || roleMutation.isPending}
              onClick={() => roleMutation.mutate(roleForm)}
            >
              {roleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editRole ? tc('save') : tc('add'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ 역할 삭제 ════ */}
      <AlertDialog open={!!deleteRoleTarget} onOpenChange={(o) => !o && setDeleteRoleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('roles.deleteRoleTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('roles.deleteRoleDesc', { name: deleteRoleTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRoleTarget?.id && deleteRoleMutation.mutate(deleteRoleTarget.id)}
            >{tc('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
