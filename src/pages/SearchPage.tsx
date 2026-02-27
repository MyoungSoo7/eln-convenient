import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search as SearchIcon, FileText, BookOpen, Package, Clock, Star } from "lucide-react";
import { mockNotes, mockProtocols, mockInventory } from "@/lib/mockData";
import { Link } from "react-router-dom";

const recentSearches = ["CRISPR", "Western Blot", "p53", "HEK293"];
const favoriteSearches = ["RNA 추출", "세포독성 분석"];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const hasQuery = query.trim().length > 0;

  const noteResults = mockNotes.filter((n) => n.title.toLowerCase().includes(query.toLowerCase()) || n.tags.some(t => t.toLowerCase().includes(query.toLowerCase())));
  const protocolResults = mockProtocols.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()));
  const inventoryResults = mockInventory.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">통합검색</h1>
        <p className="text-sm text-muted-foreground mt-1">노트, 프로토콜, 인벤토리 통합 검색</p>
      </div>

      <div className="relative max-w-2xl">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="검색어를 입력하세요..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 h-12 text-base shadow-card"
          autoFocus
        />
      </div>

      {!hasQuery ? (
        <div className="max-w-2xl space-y-6">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-muted-foreground" /> 최근 검색</h3>
            <div className="flex gap-2 flex-wrap">
              {recentSearches.map((s) => (
                <Badge key={s} variant="secondary" className="cursor-pointer hover:bg-accent" onClick={() => setQuery(s)}>{s}</Badge>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2 mb-3"><Star className="h-4 w-4 text-warning" /> 즐겨찾기</h3>
            <div className="flex gap-2 flex-wrap">
              {favoriteSearches.map((s) => (
                <Badge key={s} variant="secondary" className="cursor-pointer hover:bg-accent" onClick={() => setQuery(s)}>{s}</Badge>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="notes" className="max-w-4xl">
          <TabsList>
            <TabsTrigger value="notes" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> 노트 ({noteResults.length})</TabsTrigger>
            <TabsTrigger value="protocols" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" /> 프로토콜 ({protocolResults.length})</TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1.5"><Package className="h-3.5 w-3.5" /> 인벤토리 ({inventoryResults.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="space-y-3 mt-4">
            {noteResults.map((n) => (
              <Link key={n.id} to={`/notes/${n.id}`}>
                <Card className="shadow-card hover:shadow-elevated transition-all cursor-pointer">
                  <CardContent className="p-4">
                    <h3 className="font-medium">{n.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{n.author} · {n.updatedAt} · {n.project}</p>
                    <div className="flex gap-1.5 mt-2">{n.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {noteResults.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">검색 결과가 없습니다</p>}
          </TabsContent>

          <TabsContent value="protocols" className="space-y-3 mt-4">
            {protocolResults.map((p) => (
              <Card key={p.id} className="shadow-card hover:shadow-elevated transition-all cursor-pointer">
                <CardContent className="p-4">
                  <h3 className="font-medium">{p.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{p.category} · v{p.version} · {p.author}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="inventory" className="space-y-3 mt-4">
            {inventoryResults.map((i) => (
              <Card key={i.id} className="shadow-card hover:shadow-elevated transition-all cursor-pointer">
                <CardContent className="p-4">
                  <h3 className="font-medium">{i.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{i.location} · {i.quantity} {i.unit} · {i.barcode}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
