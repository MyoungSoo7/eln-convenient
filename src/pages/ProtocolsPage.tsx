import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, Copy, Plus } from "lucide-react";
import { mockProtocols } from "@/lib/mockData";
import { useState } from "react";

export default function ProtocolsPage() {
  const [search, setSearch] = useState("");
  const filtered = mockProtocols.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()) || p.category.includes(search)
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">프로토콜 / 템플릿</h1>
          <p className="text-sm text-muted-foreground mt-1">표준 실험 프로토콜 관리</p>
        </div>
        <Button className="gradient-primary text-primary-foreground gap-2">
          <Plus className="h-4 w-4" /> 새 프로토콜
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="프로토콜 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <Card key={p.id} className="shadow-card hover:shadow-elevated transition-all cursor-pointer group">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <Badge variant="secondary" className="text-[10px]">v{p.version}</Badge>
              </div>
              <CardTitle className="text-sm mt-3 group-hover:text-primary transition-colors">{p.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{p.category}</span>
                <span>·</span>
                <span>{p.author}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {p.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <span className="text-xs text-muted-foreground">{p.usageCount}회 사용</span>
                <Button variant="ghost" size="sm" className="text-xs gap-1"><Copy className="h-3 w-3" /> 복사</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
