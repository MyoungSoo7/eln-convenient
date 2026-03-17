import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Lock, Clock, FileText, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listNotes } from "@/api/notes";
import { type Note } from "@/lib/mockData";

const statusLabels: Record<string, string> = {
  draft: "미서명",
  in_progress: "서명 대기",
  signed: "서명 완료",
  locked: "잠금 처리",
};
const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-warning/10 text-warning",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};

export default function SignaturesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    setLoading(true);
    const res = await listNotes();
    if (res.ok) setNotes(res.data);
    setLoading(false);
  }

  const signedCount = notes.filter((n) => n.status === "signed").length;
  const pendingCount = notes.filter((n) => n.status === "draft" || n.status === "in_progress").length;
  const lockedCount = notes.filter((n) => n.status === "locked").length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            전자서명
            <HelpTooltip text="연구노트에 전자서명을 하여 시점인증을 수행합니다. 서명된 노트는 수정이 불가능하며, 법적 증거력을 확보합니다." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">연구노트 전자서명 및 시점인증 관리</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadNotes} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> 새로고침
        </Button>
      </div>

      {/* 요약 카드 — API 데이터 기반 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-success/10">
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : signedCount}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                서명 완료
                <HelpTooltip text="전자서명이 완료되어 시점인증된 노트 수입니다." />
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : pendingCount}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                서명 대기
                <HelpTooltip text="아직 서명되지 않은 노트입니다. 노트를 '진행 중' 상태로 변경 후 서명할 수 있습니다." />
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-destructive/10">
              <Lock className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : lockedCount}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                잠금 처리
                <HelpTooltip text="서명 후 완전히 잠금 처리된 노트입니다. 어떠한 수정도 불가합니다." />
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 노트 서명 현황 테이블 */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            노트 서명 현황
            <HelpTooltip text="모든 연구노트의 서명 상태를 확인합니다. 서명 대기 노트는 편집기에서 '진행 시작' 후 서명할 수 있습니다." />
            {notes.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal ml-1">({notes.length}건)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">로딩 중...</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">등록된 연구노트가 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>노트 제목</TableHead>
                  <TableHead>작성자</TableHead>
                  <TableHead>서명 상태</TableHead>
                  <TableHead>최종 수정</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.title}</TableCell>
                    <TableCell className="text-muted-foreground">{n.author}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${statusColors[n.status]}`}>
                        {statusLabels[n.status] || n.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{n.updatedAt}</TableCell>
                    <TableCell>
                      <Link to={`/notes/${n.id}`}>
                        {n.status === "signed" || n.status === "locked" ? (
                          <Button variant="ghost" size="sm" className="text-xs gap-1">
                            <FileText className="h-3 w-3" /> 보기 (읽기전용)
                          </Button>
                        ) : n.status === "in_progress" ? (
                          <Button variant="ghost" size="sm" className="text-xs gap-1 text-primary">
                            <ShieldCheck className="h-3 w-3" /> 서명하기
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-xs gap-1">
                            <FileText className="h-3 w-3" /> 편집
                          </Button>
                        )}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
