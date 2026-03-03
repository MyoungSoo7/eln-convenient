import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter } from "lucide-react";
import { mockNotes, type Note } from "@/lib/mockData";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};
const statusLabels: Record<string, string> = {
  draft: "초안", in_progress: "진행 중", signed: "서명 완료", locked: "잠김",
};

export default function NotesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const filtered = mockNotes.filter((n) => {
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
          <HelpTooltip text="상태 필터: 초안(작성 중), 진행 중(실험 수행), 서명 완료(검증됨), 잠김(변경 불가)" side="bottom" />
          {["all", "draft", "in_progress", "signed", "locked"].map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className="text-xs">
              {f === "all" ? "전체" : statusLabels[f]}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((note) => (
          <Link key={note.id} to={`/notes/${note.id}`}>
            <Card className="shadow-card hover:shadow-elevated transition-all cursor-pointer group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold group-hover:text-primary transition-colors">{note.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{note.project}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {note.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <Badge className={`text-[10px] ${statusColors[note.status]}`}>{statusLabels[note.status]}</Badge>
                    <p className="text-xs text-muted-foreground mt-2">{note.author}</p>
                    <p className="text-xs text-muted-foreground">{note.updatedAt}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
