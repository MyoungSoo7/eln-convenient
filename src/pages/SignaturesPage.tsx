import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Lock, Unlock, FileText } from "lucide-react";
import { mockNotes } from "@/lib/mockData";
import { Link } from "react-router-dom";

const statusLabels: Record<string, string> = {
  draft: "미서명", in_progress: "미서명", signed: "서명 완료", locked: "잠김",
};
const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground", in_progress: "bg-muted text-muted-foreground",
  signed: "bg-success/10 text-success", locked: "bg-destructive/10 text-destructive",
};

export default function SignaturesPage() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">전자서명</h1>
        <p className="text-sm text-muted-foreground mt-1">연구노트 전자서명 및 시점인증 관리</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-success/10"><ShieldCheck className="h-5 w-5 text-success" /></div>
            <div>
              <p className="text-2xl font-bold">2</p>
              <p className="text-xs text-muted-foreground">서명 완료</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-warning/10"><Unlock className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-2xl font-bold">3</p>
              <p className="text-xs text-muted-foreground">서명 대기</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-destructive/10"><Lock className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-2xl font-bold">1</p>
              <p className="text-xs text-muted-foreground">잠금 처리</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">노트 서명 현황</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>노트 제목</TableHead>
                <TableHead>작성자</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>최종 수정</TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockNotes.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell className="text-muted-foreground">{n.author}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${statusColors[n.status]}`}>{statusLabels[n.status]}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{n.updatedAt}</TableCell>
                  <TableCell>
                    <Link to={`/notes/${n.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs gap-1"><FileText className="h-3 w-3" /> 보기</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
