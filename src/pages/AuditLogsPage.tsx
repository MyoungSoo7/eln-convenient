import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ClipboardList } from "lucide-react";
import { mockAuditLog } from "@/lib/mockData";
import { useState } from "react";

const actionColors: Record<string, string> = {
  "노트 서명": "bg-success/10 text-success",
  "노트 수정": "bg-info/10 text-info",
  "인벤토리 출고": "bg-warning/10 text-warning",
  "장비 예약": "bg-primary/10 text-primary",
  "PDF 내보내기": "bg-secondary/10 text-secondary",
  "노트 잠금": "bg-destructive/10 text-destructive",
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const filtered = mockAuditLog.filter((a) =>
    a.action.includes(search) || a.user.includes(search) || a.details.includes(search)
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">감사로그</h1>
        <p className="text-sm text-muted-foreground mt-1">모든 활동 이력 추적 및 검색</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="활동, 사용자, 내용 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>시간</TableHead>
                <TableHead>활동</TableHead>
                <TableHead>사용자</TableHead>
                <TableHead>상세</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{a.timestamp}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${actionColors[a.action] || 'bg-muted text-muted-foreground'}`}>{a.action}</Badge></TableCell>
                  <TableCell className="font-medium">{a.user}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{a.details}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{a.ipAddress}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
