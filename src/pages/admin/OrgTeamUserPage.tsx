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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users, Building2, Building, Plus, Loader2, MoreHorizontal, UserPlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "@/hooks/use-toast";
import {
  listUsers, createUser, updateUser, deleteUser,
  listTeams, createTeam, updateTeam, deleteTeam,
  listTeamMembers, addTeamMember, removeTeamMember,
  listOrgs, createOrg, updateOrg, deleteOrg,
  listRoles,
} from "@/api/admin";
import type {
  AdminOrg, AdminUser, AdminTeam, AdminRole, AdminTeamMember,
  CreateUserPayload, UpdateUserPayload,
} from "@/api/admin";

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-muted text-muted-foreground',
  suspended: 'bg-destructive/10 text-destructive',
};

export default function OrgTeamUserPage() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');

  const STATUS_LABELS: Record<string, string> = {
    active: tc('status.active'), inactive: tc('status.inactive'), suspended: tc('status.suspended'),
  };

  const qc = useQueryClient();

  // ─── 사용자 상태 ──────────────────────────────────
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState<CreateUserPayload>({ name: '', email: '', password: '', roleId: '' });
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [userEditForm, setUserEditForm] = useState<UpdateUserPayload>({ name: '', roleId: '', status: '' });
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUser | null>(null);

  // ─── 팀 상태 ─────────────────────────────────────
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<AdminTeam | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', orgId: '' });
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<AdminTeam | null>(null);
  const [memberTeam, setMemberTeam] = useState<AdminTeam | null>(null);

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
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.loadUsersFailed'));
      return res.data;
    },
  });

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: async () => {
      const res = await listTeams();
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.loadTeamsFailed'));
      return res.data;
    },
  });

  const orgsQuery = useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => {
      const res = await listOrgs();
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.loadOrgsFailed'));
      return res.data;
    },
  });

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const res = await listRoles();
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.loadRolesFailed'));
      return res.data;
    },
  });

  const teamMembersQuery = useQuery({
    queryKey: ['admin', 'teamMembers', memberTeam?.id],
    queryFn: async () => {
      if (!memberTeam) return [] as AdminTeamMember[];
      const res = await listTeamMembers(memberTeam.id);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.loadMembersFailed'));
      return res.data;
    },
    enabled: !!memberTeam,
  });

  // ─── 사용자 Mutations ─────────────────────────────
  const createUserMutation = useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await createUser(payload);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.addUserFailed'));
      return res.data;
    },
    onSuccess: () => {
      toast({ title: t('orgTeamUser.userAdded') });
      setAddUserOpen(false);
      setNewUserForm({ name: '', email: '', password: '', roleId: '' });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.addUserFailed'), description: err.message, variant: 'destructive' }),
  });

  const updateUserMutation = useMutation({
    mutationFn: async (values: UpdateUserPayload) => {
      const res = await updateUser(editUser!.id, values);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.updateUserFailed'));
      return res.data;
    },
    onSuccess: () => {
      toast({ title: t('orgTeamUser.userUpdated') });
      setEditUserOpen(false);
      setEditUser(null);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.updateUserFailed'), description: err.message, variant: 'destructive' }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteUser(id);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.deleteUserFailed'));
    },
    onSuccess: () => {
      toast({ title: t('orgTeamUser.userDeleted') });
      setDeleteUserTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.deleteUserFailed'), description: err.message, variant: 'destructive' }),
  });

  // ─── 팀 Mutations ─────────────────────────────────
  const teamMutation = useMutation({
    mutationFn: async (values: { name: string; orgId: string }) => {
      const res = editTeam
        ? await updateTeam(editTeam.id, { name: values.name })
        : await createTeam(values);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.saveTeamFailed'));
      return res.data;
    },
    onSuccess: () => {
      toast({ title: editTeam ? t('orgTeamUser.teamUpdated') : t('orgTeamUser.teamAdded') });
      setTeamDialogOpen(false);
      setEditTeam(null);
      setTeamForm({ name: '', orgId: '' });
      qc.invalidateQueries({ queryKey: ['admin', 'teams'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.saveTeamFailed'), description: err.message, variant: 'destructive' }),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteTeam(id);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.deleteTeamFailed'));
    },
    onSuccess: () => {
      toast({ title: t('orgTeamUser.teamDeleted') });
      setDeleteTeamTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'teams'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.deleteTeamFailed'), description: err.message, variant: 'destructive' }),
  });

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await addTeamMember(memberTeam!.id, userId);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.addMemberFailed'));
    },
    onSuccess: () => {
      toast({ title: t('orgTeamUser.memberAdded') });
      qc.invalidateQueries({ queryKey: ['admin', 'teamMembers', memberTeam?.id] });
      qc.invalidateQueries({ queryKey: ['admin', 'teams'] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.addMemberFailed'), description: err.message, variant: 'destructive' }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await removeTeamMember(memberTeam!.id, userId);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.removeMemberFailed'));
    },
    onSuccess: () => {
      toast({ title: t('orgTeamUser.memberRemoved') });
      qc.invalidateQueries({ queryKey: ['admin', 'teamMembers', memberTeam?.id] });
      qc.invalidateQueries({ queryKey: ['admin', 'teams'] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.removeMemberFailed'), description: err.message, variant: 'destructive' }),
  });

  // ─── 조직 Mutations ───────────────────────────────
  const orgMutation = useMutation({
    mutationFn: async (values: { name: string; slug: string }) => {
      const res = editOrg ? await updateOrg(editOrg.id, values) : await createOrg(values);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.saveOrgFailed'));
      return res.data;
    },
    onSuccess: () => {
      toast({ title: editOrg ? t('orgTeamUser.orgUpdated') : t('orgTeamUser.orgAdded') });
      setOrgDialogOpen(false);
      setEditOrg(null);
      setOrgForm({ name: '', slug: '' });
      qc.invalidateQueries({ queryKey: ['admin', 'orgs'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.saveOrgFailed'), description: err.message, variant: 'destructive' }),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteOrg(id);
      if (!res.ok) throw new Error(res.error ?? t('orgTeamUser.deleteOrgFailed'));
    },
    onSuccess: () => {
      toast({ title: t('orgTeamUser.orgDeleted') });
      setDeleteOrgTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'orgs'] });
    },
    onError: (err: Error) => toast({ title: t('orgTeamUser.deleteOrgFailed'), description: err.message, variant: 'destructive' }),
  });

  // ─── 팀에 추가 가능한 사용자 ──
  const nonMembers = (usersQuery.data ?? []).filter(
    (u) => !(teamMembersQuery.data ?? []).some((m) => m.userId === u.id)
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          {t('orgTeamUser.title')}
          <HelpTooltip text={t('orgTeamUser.titleTooltip')} />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('orgTeamUser.subtitle')}</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> {t('orgTeamUser.usersTab')}</TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> {t('orgTeamUser.teamsTab')}</TabsTrigger>
          <TabsTrigger value="orgs" className="gap-1.5"><Building className="h-3.5 w-3.5" /> {t('orgTeamUser.orgsTab')}</TabsTrigger>
        </TabsList>

        {/* ── 사용자 탭 ── */}
        <TabsContent value="users" className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {t('orgTeamUser.userList')}
                <HelpTooltip text={t('orgTeamUser.userListTooltip')} />
              </CardTitle>
              <Button size="sm" className="gradient-primary text-primary-foreground gap-1"
                onClick={() => setAddUserOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> {t('orgTeamUser.addUser')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {usersQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              {usersQuery.isError && (
                <div className="p-4 text-sm text-destructive">
                  {(usersQuery.error as Error).message}
                  <Button variant="ghost" size="sm" className="ml-2" onClick={() => usersQuery.refetch()}>{tc('retry')}</Button>
                </div>
              )}
              {usersQuery.data && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('orgTeamUser.col.name')}</TableHead>
                      <TableHead>{t('orgTeamUser.col.email')}</TableHead>
                      <TableHead>{t('orgTeamUser.col.role')}</TableHead>
                      <TableHead>{t('orgTeamUser.col.team')}</TableHead>
                      <TableHead>{t('orgTeamUser.col.status')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersQuery.data.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t('orgTeamUser.noUsers')}</TableCell></TableRow>
                    )}
                    {usersQuery.data.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{u.role ?? '—'}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm">{u.team ?? '—'}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${STATUS_COLORS[u.status] ?? ''}`}>
                            {STATUS_LABELS[u.status] ?? u.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setEditUser(u);
                                setUserEditForm({ name: u.name, roleId: u.roleId ?? '', status: u.status });
                                setEditUserOpen(true);
                              }}>{tc('edit')}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteUserTarget(u)}>{tc('delete')}</DropdownMenuItem>
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
              <CardTitle className="text-base">{t('orgTeamUser.teamList')}</CardTitle>
              <Button size="sm" className="gradient-primary text-primary-foreground gap-1"
                onClick={() => {
                  setEditTeam(null);
                  setTeamForm({ name: '', orgId: orgsQuery.data?.[0]?.id ?? '' });
                  setTeamDialogOpen(true);
                }}>
                <Plus className="h-3.5 w-3.5" /> {t('orgTeamUser.addTeam')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {teamsQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              {teamsQuery.isError && (
                <div className="p-4 text-sm text-destructive">
                  {(teamsQuery.error as Error).message}
                  <Button variant="ghost" size="sm" className="ml-2" onClick={() => teamsQuery.refetch()}>{tc('retry')}</Button>
                </div>
              )}
              {teamsQuery.data && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('orgTeamUser.col.teamName')}</TableHead>
                      <TableHead>{t('orgTeamUser.col.members')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamsQuery.data.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">{t('orgTeamUser.noTeams')}</TableCell></TableRow>
                    )}
                    {teamsQuery.data.map((tm) => (
                      <TableRow key={tm.id}>
                        <TableCell className="font-medium">{tm.name}</TableCell>
                        <TableCell className="text-muted-foreground">{t('orgTeamUser.memberCount', { count: tm.memberCount })}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setMemberTeam(tm)}>
                                <UserPlus className="h-3.5 w-3.5 mr-2" /> {t('orgTeamUser.manageMembers')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => {
                                setEditTeam(tm);
                                setTeamForm({ name: tm.name, orgId: '' });
                                setTeamDialogOpen(true);
                              }}>{tc('edit')}</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTeamTarget(tm)}>{tc('delete')}</DropdownMenuItem>
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
              <CardTitle className="text-base">{t('orgTeamUser.orgList')}</CardTitle>
              <Button size="sm" className="gradient-primary text-primary-foreground gap-1"
                onClick={() => { setEditOrg(null); setOrgForm({ name: '', slug: '' }); setOrgDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> {t('orgTeamUser.addOrg')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {orgsQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              {orgsQuery.isError && (
                <div className="p-4 text-sm text-destructive">
                  {(orgsQuery.error as Error).message}
                  <Button variant="ghost" size="sm" className="ml-2" onClick={() => orgsQuery.refetch()}>{tc('retry')}</Button>
                </div>
              )}
              {orgsQuery.data && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('orgTeamUser.col.orgName')}</TableHead>
                      <TableHead>{t('orgTeamUser.col.slug')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgsQuery.data.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">{t('orgTeamUser.noOrgs')}</TableCell></TableRow>
                    )}
                    {orgsQuery.data.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{o.slug}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setEditOrg(o);
                                setOrgForm({ name: o.name, slug: o.slug });
                                setOrgDialogOpen(true);
                              }}>{tc('edit')}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOrgTarget(o)}>{tc('delete')}</DropdownMenuItem>
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
      </Tabs>

      {/* ════ 사용자 추가 ════ */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('orgTeamUser.addUserTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.nameLabel')} *</label>
              <Input value={newUserForm.name} onChange={(e) => setNewUserForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.emailLabel')} *</label>
              <Input type="email" value={newUserForm.email} onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.passwordLabel')} *</label>
              <Input type="password" value={newUserForm.password} onChange={(e) => setNewUserForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.roleLabel')}</label>
              <Select value={newUserForm.roleId ?? ''} onValueChange={(v) => setNewUserForm((f) => ({ ...f, roleId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('orgTeamUser.roleSelectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {(rolesQuery.data as AdminRole[] | undefined)?.map((r) => (
                    <SelectItem key={r.id ?? r.name} value={r.id ?? r.name}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>{tc('cancel')}</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={!newUserForm.name || !newUserForm.email || !newUserForm.password || createUserMutation.isPending}
              onClick={() => createUserMutation.mutate(newUserForm)}
            >
              {createUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : tc('add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ 사용자 수정 ════ */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('orgTeamUser.editUserTitle', { name: editUser?.name })}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.nameLabel')}</label>
              <Input value={userEditForm.name ?? ''} onChange={(e) => setUserEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.roleLabel')}</label>
              <Select value={userEditForm.roleId ?? ''} onValueChange={(v) => setUserEditForm((f) => ({ ...f, roleId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('orgTeamUser.roleSelectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('orgTeamUser.noRole')}</SelectItem>
                  {(rolesQuery.data as AdminRole[] | undefined)?.map((r) => (
                    <SelectItem key={r.id ?? r.name} value={r.id ?? r.name}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.statusLabel')}</label>
              <Select value={userEditForm.status ?? ''} onValueChange={(v) => setUserEditForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue placeholder={t('orgTeamUser.statusSelectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{tc('status.active')}</SelectItem>
                  <SelectItem value="inactive">{tc('status.inactive')}</SelectItem>
                  <SelectItem value="suspended">{tc('status.suspended')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserOpen(false)}>{tc('cancel')}</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={updateUserMutation.isPending}
              onClick={() => {
                const payload: UpdateUserPayload = {};
                if (userEditForm.name) payload.name = userEditForm.name;
                if (userEditForm.roleId && userEditForm.roleId !== '__none__') payload.roleId = userEditForm.roleId;
                if (userEditForm.roleId === '__none__') payload.roleId = '';
                if (userEditForm.status) payload.status = userEditForm.status;
                updateUserMutation.mutate(payload);
              }}
            >
              {updateUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ 사용자 삭제 ════ */}
      <AlertDialog open={!!deleteUserTarget} onOpenChange={(o) => !o && setDeleteUserTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('orgTeamUser.deleteUserTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('orgTeamUser.deleteUserDesc', { name: deleteUserTarget?.name, email: deleteUserTarget?.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUserTarget && deleteUserMutation.mutate(deleteUserTarget.id)}
            >{tc('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════ 팀 생성/수정 ════ */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editTeam ? t('orgTeamUser.editTeamTitle') : t('orgTeamUser.addTeamTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.teamNameLabel')} *</label>
              <Input value={teamForm.name} onChange={(e) => setTeamForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            {!editTeam && (
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('orgTeamUser.orgLabel')} *</label>
                <Select value={teamForm.orgId} onValueChange={(v) => setTeamForm((f) => ({ ...f, orgId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t('orgTeamUser.orgSelectPlaceholder')} /></SelectTrigger>
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
            <Button variant="outline" onClick={() => setTeamDialogOpen(false)}>{tc('cancel')}</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={!teamForm.name || teamMutation.isPending}
              onClick={() => teamMutation.mutate(teamForm)}
            >
              {teamMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editTeam ? tc('save') : tc('add'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ 팀원 관리 ════ */}
      <Dialog open={!!memberTeam} onOpenChange={(o) => !o && setMemberTeam(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('orgTeamUser.manageMembersTitle', { name: memberTeam?.name })}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium mb-2">{t('orgTeamUser.currentMembers', { count: teamMembersQuery.data?.length ?? 0 })}</p>
              {teamMembersQuery.isLoading && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {(teamMembersQuery.data ?? []).length === 0 && !teamMembersQuery.isLoading && (
                  <p className="text-xs text-muted-foreground text-center py-2">{t('orgTeamUser.noMembers')}</p>
                )}
                {(teamMembersQuery.data ?? []).map((m) => (
                  <div key={m.userId} className="flex items-center justify-between bg-muted/50 rounded px-3 py-1.5 text-sm">
                    <span>{m.name} <span className="text-muted-foreground text-xs">{m.email}</span></span>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMemberMutation.mutate(m.userId)}
                      disabled={removeMemberMutation.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            {nonMembers.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">{t('orgTeamUser.addMember')}</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {nonMembers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 text-sm">
                      <span>{u.name} <span className="text-muted-foreground text-xs">{u.email}</span></span>
                      <Button
                        variant="outline" size="sm" className="h-6 text-xs gap-1"
                        onClick={() => addMemberMutation.mutate(u.id)}
                        disabled={addMemberMutation.isPending}
                      >
                        <Plus className="h-3 w-3" /> {tc('add')}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberTeam(null)}>{tc('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ 팀 삭제 ════ */}
      <AlertDialog open={!!deleteTeamTarget} onOpenChange={(o) => !o && setDeleteTeamTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('orgTeamUser.deleteTeamTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('orgTeamUser.deleteTeamDesc', { name: deleteTeamTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTeamTarget && deleteTeamMutation.mutate(deleteTeamTarget.id)}
            >{tc('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════ 조직 생성/수정 ════ */}
      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editOrg ? t('orgTeamUser.editOrgTitle') : t('orgTeamUser.addOrgTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.orgNameLabel')} *</label>
              <Input value={orgForm.name} onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('orgTeamUser.slugLabel')} * <span className="text-xs text-muted-foreground">{t('orgTeamUser.slugHint')}</span></label>
              <Input value={orgForm.slug} onChange={(e) => setOrgForm((f) => ({ ...f, slug: e.target.value }))} placeholder="my-org" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgDialogOpen(false)}>{tc('cancel')}</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={!orgForm.name || !orgForm.slug || orgMutation.isPending}
              onClick={() => orgMutation.mutate(orgForm)}
            >
              {orgMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editOrg ? tc('save') : tc('add'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ 조직 삭제 ════ */}
      <AlertDialog open={!!deleteOrgTarget} onOpenChange={(o) => !o && setDeleteOrgTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('orgTeamUser.deleteOrgTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('orgTeamUser.deleteOrgDesc', { name: deleteOrgTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteOrgTarget && deleteOrgMutation.mutate(deleteOrgTarget.id)}
            >{tc('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
