import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronDown, ShieldAlert, Lock, Unlock } from "lucide-react";
import { mockNotes, type Note } from "@/lib/mockData";
import { Link } from "react-router-dom";
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
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};
const statusLabels: Record<string, string> = {
  draft: "초안", in_progress: "진행 중", signed: "서명 완료", locked: "잠김",
};

const statusTransitions: Record<string, string[]> = {
  draft: ["in_progress"],
  in_progress: ["draft", "locked"],
  signed: [],
  locked: [],
};

// 관리자 전용 잠금 해제 대상 상태
const adminUnlockTarget = "draft";

export default function NotesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [notes, setNotes] = useState<Note[]>(mockNotes);
  const [unlockTarget, setUnlockTarget] = useState<Note | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdmin] = useState(true); // TODO: 실제 인증 연동 시 권한 체크로 교체

  const handleStatusChange = (noteId: string, newStatus: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? { ...n, status: newStatus as Note["status"], updatedAt: new Date().toISOString().slice(0, 10) }
          : n
      )
    );
    toast.success(`상태가 "${statusLabels[newStatus]}"(으)로 변경되었습니다.`);
  };

  const handleAdminUnlock = () => {
    if (!unlockTarget) return;
    if (!adminPassword.trim()) {
      toast.error("관리자 비밀번호를 입력해주세요.");
      return;
    }
    // TODO: 실제 관리자 비밀번호 검증 API 호출
    handleStatusChange(unlockTarget.id, adminUnlockTarget);
    toast.success(`"${unlockTarget.title}" 노트의 잠금이 해제되었습니다.`, {
      description: "관리자 권한으로 잠금 해제됨 — 감사로그에 기록됩니다.",
      icon: <Unlock className="h-4 w-4" />,
    });
    setUnlockTarget(null);
    setAdminPassword("");
  };

  const filtered = notes.filter((n) => {
    const matchSearch = n.title.toLowerCase().includes(search.toLowerCase()) || n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchFilter = filter === "all" || n.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            연구노트
            <HelpTooltip text="모든 연구노트를 조회하고 관리하는 화면입니다. 제목이나 태그로 검색하고, 상태별로 필터링할 수 있습니다." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">실험 기록 관리 및 검색</p>
        </div>
        <Link to="/notes/new">
          <Button className="gradient-primary text-primary-foreground gap-2">
            <Plus className="h-4 w-4" /> 새 노트
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="노트 제목, 태그 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-1.5 items-center">
          <HelpTooltip text="상태 필터: 초안(작성 중), 진행 중(실험 수행), 서명 완료(검증됨), 잠김(변경 불가). 관리자는 잠긴 노트를 해제할 수 있습니다." side="bottom" />
          {["all", "draft", "in_progress", "signed", "locked"].map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className="text-xs">
              {f === "all" ? "전체" : statusLabels[f]}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((note) => {
          const canTransition = statusTransitions[note.status]?.length > 0;
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
                          {canTransition && statusTransitions[note.status].map((s) => (
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
                                <ShieldAlert className="h-3 w-3" /> 관리자 전용
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => setUnlockTarget(note)}
                                className="text-xs text-destructive focus:text-destructive"
                              >
                                <Unlock className="h-3 w-3 mr-2" />
                                잠금 해제
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Badge className={`text-[10px] ${statusColors[note.status]}`}>{statusLabels[note.status]}</Badge>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{note.author}</p>
                    <p className="text-xs text-muted-foreground">{note.updatedAt}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 관리자 잠금 해제 확인 모달 */}
      <Dialog open={!!unlockTarget} onOpenChange={(open) => { if (!open) { setUnlockTarget(null); setAdminPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              관리자 잠금 해제
            </DialogTitle>
            <DialogDescription>
              <strong>"{unlockTarget?.title}"</strong> 노트의 잠금을 해제합니다.
              해제 후 상태가 "초안"으로 변경되며, 이 작업은 감사로그에 기록됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">관리자 비밀번호</label>
              <Input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdminUnlock()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ 이 작업은 되돌릴 수 없으며, 감사 추적(Audit Trail)에 관리자 정보와 함께 기록됩니다.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setUnlockTarget(null); setAdminPassword(""); }}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleAdminUnlock} className="gap-2">
              <Unlock className="h-4 w-4" /> 잠금 해제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}