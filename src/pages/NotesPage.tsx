import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronDown, ShieldAlert, Lock, Unlock, Trash2, FileText } from "lucide-react";
import { type Note } from "@/lib/mockData";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { listNotes, changeNoteStatus, adminUnlockNote, deleteNote } from "@/api/notes";
import { getStoredUser } from "@/lib/authToken";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};
// 역할 기반 상태 전환 맵: locked 전환은 reviewer/admin만 허용 (백엔드 규칙과 일치)
function getStatusTransitions(status: string, role: string): string[] {
  const isReviewerOrAdmin = role === "reviewer" || role === "admin";
  switch (status) {
    case "draft": return ["in_progress"];
    case "in_progress": return isReviewerOrAdmin ? ["draft", "locked"] : ["draft"];
    case "signed": return [];
    case "locked": return [];
    default: return [];
  }
}

// draft / in_progress 상태만 삭제 허용
// signed: 법적 불변성, locked: 관리자 잠금 상태 — 삭제 불가
const isDeletable = (status: string) => status === "draft" || status === "in_progress";

export default function NotesPage() {
  const { t } = useTranslation('notes');
  const { t: tc } = useTranslation('common');

  const statusLabels: Record<string, string> = {
    draft: tc('status.draft'), in_progress: tc('status.in_progress'), signed: tc('status.signed'), locked: tc('status.locked'),
  };

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Note | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const storedUser = getStoredUser();
  const userRole = (storedUser?.role as string) ?? "";
  const isAdmin = userRole === "admin";
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const templateIdFilter = searchParams.get("templateId") ?? undefined;

  // 노트 목록 API 로드
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    listNotes({
      ...(filter !== "all" && { status: filter }),
      ...(templateIdFilter && { templateId: templateIdFilter }),
    })
      .then((res) => {
        if (res.ok) {
          setNotes(res.data);
        } else {
          setLoadError(res.error || t('loadError'));
          setNotes([]);
        }
      })
      .finally(() => setLoading(false));
  }, [filter, templateIdFilter]);

  const handleStatusChange = async (noteId: string, newStatus: string) => {
    const res = await changeNoteStatus(noteId, newStatus as Note["status"]);
    if (res.ok) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? { ...n, status: newStatus as Note["status"], updatedAt: new Date().toISOString().slice(0, 10) }
            : n
        )
      );
      toast.success(t('statusChanged', { status: statusLabels[newStatus] }));
    } else {
      toast.error(res.error || t('statusChangeFailed'));
    }
  };

  const handleAdminUnlock = async () => {
    if (!unlockTarget) return;
    if (!adminPassword.trim()) {
      toast.error(t('unlockPasswordRequired'));
      return;
    }
    setUnlocking(true);
    const res = await adminUnlockNote(unlockTarget.id, adminPassword, t('unlockTitle'));
    setUnlocking(false);
    if (res.ok) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === unlockTarget.id
            ? { ...n, status: "draft", updatedAt: new Date().toISOString().slice(0, 10) }
            : n
        )
      );
      toast.success(t('unlockSuccess', { title: unlockTarget.title }), {
        description: t('unlockSuccessDesc'),
        icon: <Unlock className="h-4 w-4" />,
      });
      setUnlockTarget(null);
      setAdminPassword("");
    } else {
      toast.error(res.error || t('unlockFailed'));
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteNote(deleteTarget.id);
    setDeleting(false);
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      toast.success(t('deleteSuccess', { title: deleteTarget.title }));
      setDeleteTarget(null);
    } else {
      toast.error(res.error || t('deleteFailed'));
    }
  };

  const filtered = notes.filter((n) => {
    const matchSearch =
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchSearch;
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {t('title')}
            <HelpTooltip text={t('titleTooltip')} />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Link to="/notes/new">
          <Button className="gradient-primary text-primary-foreground gap-2">
            <Plus className="h-4 w-4" /> {t('newNote')}
          </Button>
        </Link>
      </div>

      {/* templateId 필터 중 안내 배너 */}
      {templateIdFilter && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          <FileText className="h-4 w-4 shrink-0" />
          {t('templateFilterBanner')}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs ml-auto"
            onClick={() => navigate("/notes")}
          >
            {t('clearFilter')}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1.5 items-center">
          <HelpTooltip text={t('filterTooltip')} side="bottom" />
          {["all", "draft", "in_progress", "signed", "locked"].map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="text-xs"
            >
              {f === "all" ? tc('all') : statusLabels[f]}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{tc('loading')}</div>
      ) : loadError ? (
        <div className="text-center py-12 text-destructive text-sm">
          ⚠️ {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {search ? t('noResults') : t('empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((note) => {
            const transitions = getStatusTransitions(note.status, userRole);
            const canTransition = transitions.length > 0;
            const canAdminUnlock = isAdmin && note.status === "locked";

            return (
              <Card key={note.id} className="shadow-card hover:shadow-elevated transition-all group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <Link to={`/notes/${note.id}`} className="min-w-0 flex-1">
                      <h3 className="font-semibold group-hover:text-primary transition-colors">{note.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{note.project}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {note.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </Link>
                    <div className="text-right shrink-0 ml-4 flex flex-col items-end gap-1">
                      {canTransition || canAdminUnlock ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer hover:opacity-80 transition-opacity ${statusColors[note.status]}`}>
                              {note.status === "locked" && <Lock className="h-3 w-3" />}
                              {statusLabels[note.status]}
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[140px]">
                            {canTransition && transitions.map((s) => (
                              <DropdownMenuItem
                                key={s}
                                onClick={() => handleStatusChange(note.id, s)}
                                className="text-xs"
                              >
                                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${statusColors[s].split(" ")[0]}`} />
                                {statusLabels[s]}
                              </DropdownMenuItem>
                            ))}
                            {canAdminUnlock && (
                              <>
                                {canTransition && <DropdownMenuSeparator />}
                                <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal flex items-center gap-1">
                                  <ShieldAlert className="h-3 w-3" /> {t('adminOnly')}
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                  onClick={() => setUnlockTarget(note)}
                                  className="text-xs text-destructive focus:text-destructive"
                                >
                                  <Unlock className="h-3 w-3 mr-2" />
                                  {t('unlock')}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Badge className={`text-[10px] ${statusColors[note.status]}`}>{statusLabels[note.status]}</Badge>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{note.author || note.authorId || '-'}</p>
                      <p className="text-xs text-muted-foreground">{note.updatedAt}</p>
                      {/* 삭제 버튼: draft / in_progress 만 표시 */}
                      {isDeletable(note.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.preventDefault(); setDeleteTarget(note); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 관리자 잠금 해제 확인 모달 */}
      <Dialog
        open={!!unlockTarget}
        onOpenChange={(open) => { if (!open) { setUnlockTarget(null); setAdminPassword(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {t('unlockTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('unlockDesc', { title: unlockTarget?.title })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('unlockPassword')}</label>
              <Input
                type="password"
                placeholder={t('unlockPasswordPlaceholder')}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdminUnlock()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('unlockWarning')}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setUnlockTarget(null); setAdminPassword(""); }}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleAdminUnlock} disabled={unlocking} className="gap-2">
              <Unlock className="h-4 w-4" />
              {unlocking ? t('unlocking') : t('unlock')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 노트 삭제 확인 다이얼로그 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDesc', { title: deleteTarget?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? tc('deleting') : tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
