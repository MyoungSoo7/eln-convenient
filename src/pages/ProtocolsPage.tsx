import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, Copy, Plus, FileText, Loader2, Pencil, Trash2, ArrowRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "sonner";
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
import NewProtocolDialog from "@/components/NewProtocolDialog";
import EditProtocolDialog from "@/components/EditProtocolDialog";
import { listTemplates, copyTemplate, deleteTemplate, type TemplateRecord } from "@/api/notes";

export default function ProtocolsPage() {
  const [search, setSearch] = useState("");
  const [protocols, setProtocols] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<TemplateRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const res = await listTemplates({ limit: 200 });
    if (res.ok && Array.isArray(res.data)) setProtocols(res.data);
    else setProtocols([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreateNote = (p: TemplateRecord) => {
    navigate("/notes/new", {
      state: {
        fromProtocol: true,
        protocolId: p.id,
        title: `[${p.category ?? ""}] ${p.title}`,
        tags: p.tags ?? [],
        category: p.category,
        author: p.createdBy,
      },
    });
    toast.success("프로토콜 기반 연구노트를 생성합니다.", { description: `"${p.title}" 템플릿 적용` });
  };

  const filtered = protocols.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()) || (p.category ?? "").includes(search)
  );

  const handleCreated = (template: TemplateRecord) => {
    setProtocols((prev) => [template, ...prev]);
  };

  const handleUpdated = (updated: TemplateRecord) => {
    setProtocols((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditTarget(null);
  };

  const handleCopy = async (p: TemplateRecord) => {
    setCopyingId(p.id);
    const res = await copyTemplate(p.id);
    setCopyingId(null);
    if (res.ok && res.data) {
      setProtocols((prev) => [res.data!, ...prev]);
      toast.success("프로토콜이 복사되었습니다.", { description: `"${res.data.title}" 생성됨` });
    } else {
      toast.error(res.error ?? "템플릿 복사에 실패했습니다.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteTemplate(deleteTarget.id);
    setDeleting(false);
    if (res.ok) {
      setProtocols((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success(`"${deleteTarget.title}" 프로토콜이 삭제되었습니다.`);
      setDeleteTarget(null);
    } else {
      toast.error(res.error ?? "프로토콜 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            프로토콜 / 템플릿
            <HelpTooltip text="표준 실험 프로토콜을 관리하는 화면입니다. 템플릿을 복사하여 새 연구노트를 빠르게 생성할 수 있습니다." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">표준 실험 프로토콜 관리</p>
        </div>
        <Button className="gradient-primary text-primary-foreground gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> 새 프로토콜
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="프로토콜 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> 로딩 중...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <p className="col-span-full text-center text-muted-foreground py-12">
              {protocols.length === 0 ? "등록된 프로토콜이 없습니다. 새 프로토콜을 생성해보세요." : "검색 결과가 없습니다."}
            </p>
          ) : (
            filtered.map((p) => (
              <Card key={p.id} className="shadow-card hover:shadow-elevated transition-all cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{p.category ?? "일반"}</Badge>
                  </div>
                  <CardTitle className="text-sm mt-3 group-hover:text-primary transition-colors">{p.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{p.category ?? "일반"}</span>
                    <span>·</span>
                    <span>{p.createdBy ?? "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {(p.tags ?? []).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                  </div>
                  <div className="mt-4 pt-3 border-t space-y-2">
                    {/* 사용 횟수 + 노트 보기 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {p.useCount ?? 0}회 사용
                        <HelpTooltip text="이 프로토콜로 연구노트를 생성한 횟수입니다." />
                      </span>
                      {(p.useCount ?? 0) > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs gap-1 h-6 px-2 text-primary"
                          onClick={(e) => { e.stopPropagation(); navigate(`/notes?templateId=${p.id}`); }}
                        >
                          노트 보기 <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {/* 액션 버튼 */}
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCreateNote(p); }}>
                        <FileText className="h-3 w-3" /> 노트 생성
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCopy(p); }} disabled={copyingId === p.id}>
                        {copyingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} 복사
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs p-1.5 text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); setEditTarget(p); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs p-1.5 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* 새 프로토콜 생성 다이얼로그 */}
      <NewProtocolDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleCreated} />

      {/* 프로토콜 수정 다이얼로그 */}
      {editTarget && (
        <EditProtocolDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          template={editTarget}
          onUpdated={handleUpdated}
        />
      )}

      {/* 프로토콜 삭제 확인 다이얼로그 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프로토콜을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteTarget?.title}"</strong> 프로토콜을 삭제합니다.
              삭제 후 복구할 수 없으며, 이 프로토콜로 만든 노트는 유지됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
