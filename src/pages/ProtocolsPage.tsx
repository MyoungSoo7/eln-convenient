import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, Copy, Plus, FileText, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "sonner";
import NewProtocolDialog from "@/components/NewProtocolDialog";
import { listTemplates, copyTemplate, type TemplateRecord } from "@/api/notes";

export default function ProtocolsPage() {
  const [search, setSearch] = useState("");
  const [protocols, setProtocols] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
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
                  <div className="flex items-center justify-between mt-4 pt-3 border-t gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">{p.useCount ?? 0}회 사용 <HelpTooltip text="이 프로토콜로 연구노트를 생성한 횟수입니다." /></span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCreateNote(p); }}><FileText className="h-3 w-3" /> 노트 생성</Button>
                      <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCopy(p); }} disabled={copyingId === p.id}>
                        {copyingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} 복사
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <NewProtocolDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleCreated} />
    </div>
  );
}
