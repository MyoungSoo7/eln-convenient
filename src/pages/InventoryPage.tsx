import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Filter, Package } from "lucide-react";
import { mockInventory, type InventoryItem } from "@/lib/mockData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const typeLabels: Record<string, string> = { reagent: "시약", sample: "샘플", equipment: "장비", consumable: "소모품" };
const statusLabels: Record<string, string> = { available: "사용 가능", low_stock: "재고 부족", out_of_stock: "품절", in_use: "사용 중" };
const statusColors: Record<string, string> = {
  available: "bg-success/10 text-success", low_stock: "bg-warning/10 text-warning",
  out_of_stock: "bg-destructive/10 text-destructive", in_use: "bg-info/10 text-info",
};

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const filtered = mockInventory.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.barcode.includes(search);
    const matchType = typeFilter === "all" || item.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">인벤토리</h1>
          <p className="text-sm text-muted-foreground mt-1">시약, 샘플, 장비 관리</p>
        </div>
        <Button className="gradient-primary text-primary-foreground gap-2"><Plus className="h-4 w-4" /> 항목 추가</Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="이름, 바코드 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-1.5">
          {["all", "reagent", "sample", "equipment", "consumable"].map((f) => (
            <Button key={f} variant={typeFilter === f ? "default" : "outline"} size="sm" onClick={() => setTypeFilter(f)} className="text-xs">
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
                <TableHead>이름</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>수량</TableHead>
                <TableHead>위치</TableHead>
                <TableHead>바코드</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedItem(item)}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{typeLabels[item.type]}</Badge></TableCell>
                  <TableCell><Badge className={`text-[10px] ${statusColors[item.status]}`}>{statusLabels[item.status]}</Badge></TableCell>
                  <TableCell>{item.quantity} {item.unit}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.location}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.barcode}</TableCell>
                </TableRow>
              ))}
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
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">유형:</span> <span className="ml-2 font-medium">{typeLabels[selectedItem.type]}</span></div>
                <div><span className="text-muted-foreground">상태:</span> <Badge className={`ml-2 text-[10px] ${statusColors[selectedItem.status]}`}>{statusLabels[selectedItem.status]}</Badge></div>
                <div><span className="text-muted-foreground">수량:</span> <span className="ml-2 font-medium">{selectedItem.quantity} {selectedItem.unit}</span></div>
                <div><span className="text-muted-foreground">위치:</span> <span className="ml-2 font-medium">{selectedItem.location}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">바코드:</span> <span className="ml-2 font-mono">{selectedItem.barcode}</span></div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">태그:</span>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {selectedItem.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                </div>
              </div>
              <div className="pt-3 border-t">
                <p className="text-sm font-medium mb-2">관련 노트</p>
                <p className="text-xs text-muted-foreground">연결된 연구노트가 없습니다.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
