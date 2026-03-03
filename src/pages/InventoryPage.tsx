import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Monitor, FileText, Key, Server, Package } from "lucide-react";
import { mockInventory, type InventoryItem } from "@/lib/mockData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpTooltip } from "@/components/HelpTooltip";

const typeLabels: Record<string, string> = {
  dev_equipment: "개발장비",
  deliverable: "산출물",
  license: "라이선스",
  infra: "인프라",
};
const typeIcons: Record<string, typeof Monitor> = {
  dev_equipment: Monitor,
  deliverable: FileText,
  license: Key,
  infra: Server,
};
const statusLabels: Record<string, string> = {
  available: "사용 가능",
  in_use: "사용 중",
  completed: "완료",
  expired: "만료",
  archived: "보관",
};
const statusColors: Record<string, string> = {
  available: "bg-success/10 text-success",
  in_use: "bg-info/10 text-info",
  completed: "bg-primary/10 text-primary",
  expired: "bg-destructive/10 text-destructive",
  archived: "bg-muted text-muted-foreground",
};

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const filtered = mockInventory.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.barcode.includes(search) ||
      (item.project?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchType = typeFilter === "all" || item.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            개발 인벤토리
            <HelpTooltip text="개발 프로젝트에 사용되는 장비, 산출물, 라이선스, 인프라를 통합 관리하는 화면입니다. 이름, 바코드, 프로젝트명으로 검색할 수 있습니다." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">개발장비 및 개발산출물 관리</p>
        </div>
        <Button className="gradient-primary text-primary-foreground gap-2">
          <Plus className="h-4 w-4" /> 항목 추가
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 바코드, 프로젝트명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1.5 items-center">
          <HelpTooltip text="유형별 필터: 개발장비(PC, 모니터 등), 산출물(설계서, 보고서), 라이선스(SW 라이선스), 인프라(서버, 클라우드)" side="bottom" />
          {["all", "dev_equipment", "deliverable", "license", "infra"].map((f) => (
            <Button
              key={f}
              variant={typeFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(f)}
              className="text-xs"
            >
              {f === "all" ? "전체" : typeLabels[f]}
            </Button>
          ))}
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="flex items-center gap-1">
                  이름 <HelpTooltip text="개발장비명 또는 산출물 명칭입니다." />
                </TableHead>
                <TableHead>유형</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>수량</TableHead>
                <TableHead>위치/저장소</TableHead>
                <TableHead>프로젝트</TableHead>
                <TableHead>관리코드</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const Icon = typeIcons[item.type] || Package;
                return (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedItem(item)}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      {item.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{typeLabels[item.type]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${statusColors[item.status]}`}>{statusLabels[item.status]}</Badge>
                    </TableCell>
                    <TableCell>{item.quantity} {item.unit}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.location}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.project || "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.barcode}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {selectedItem?.name}
              <HelpTooltip text="항목의 상세 정보를 확인하고, 연결된 프로젝트와 이력을 조회할 수 있습니다." />
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">유형:</span>
                  <span className="ml-2 font-medium">{typeLabels[selectedItem.type]}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">상태:</span>
                  <Badge className={`ml-2 text-[10px] ${statusColors[selectedItem.status]}`}>{statusLabels[selectedItem.status]}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">수량:</span>
                  <span className="ml-2 font-medium">{selectedItem.quantity} {selectedItem.unit}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">위치:</span>
                  <span className="ml-2 font-medium">{selectedItem.location}</span>
                </div>
                {selectedItem.project && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">프로젝트:</span>
                    <span className="ml-2 font-medium">{selectedItem.project}</span>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-muted-foreground">관리코드:</span>
                  <span className="ml-2 font-mono">{selectedItem.barcode}</span>
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">태그:</span>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {selectedItem.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
              <div className="pt-3 border-t">
                <p className="text-sm font-medium mb-2">관련 이력</p>
                <p className="text-xs text-muted-foreground">연결된 변경 이력이 없습니다.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
