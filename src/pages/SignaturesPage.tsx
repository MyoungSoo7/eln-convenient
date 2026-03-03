import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Lock, Unlock, FileText } from "lucide-react";
import { mockNotes } from "@/lib/mockData";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";

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
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          전자서명
          <HelpTooltip text="연구노트에 전자서명을 하여 시점인증을 수행합니다. 서명된 노트는 수정이 불가능하며, 법적 증거력을 확보합니다." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">연구노트 전자서명 및 시점인증 관리</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-success/10"><ShieldCheck className="h-5 w-5 text-success" /></div>
            <div>
              <p className="text-2xl font-bold">2</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">서명 완료 <HelpTooltip text="전자서명이 완료되어 시점인증된 노트 수입니다." /></p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-warning/10"><Unlock className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-2xl font-bold">3</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">서명 대기 <HelpTooltip text="아직 서명되지 않은 노트입니다. 노트 편집기에서 서명할 수 있습니다." /></p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-destructive/10"><Lock className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-2xl font-bold">1</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">잠금 처리 <HelpTooltip text="서명 후 완전히 잠금 처리된 노트입니다. 어떠한 수정도 불가합니다." /></p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            노트 서명 현황
            <HelpTooltip text="모든 연구노트의 서명 상태를 확인합니다. '보기' 버튼을 클릭하면 해당 노트의 편집기로 이동하여 서명을 진행할 수 있습니다." />
          </CardTitle>
        </CardHeader>
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
