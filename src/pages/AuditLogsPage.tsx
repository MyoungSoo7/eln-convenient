import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ClipboardList, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listAuditLogs, listAuditActions, type AuditLogQuery, type AuditLogEntry } from "@/api/signatures";

// 액션별 색상 매핑 — 알려진 액션은 고유 색상, 나머지는 기본
const ACTION_COLORS: Record<string, string> = {
  signed: "bg-success/10 text-success",
  revoked: "bg-destructive/10 text-destructive",
  export_requested: "bg-secondary/10 text-secondary",
  export_completed: "bg-success/10 text-success",
  export_failed: "bg-destructive/10 text-destructive",
  note_created: "bg-info/10 text-info",
  note_updated: "bg-info/10 text-info",
  note_locked: "bg-warning/10 text-warning",
  login: "bg-primary/10 text-primary",
  logout: "bg-muted text-muted-foreground",
};

const PAGE_SIZE = 20;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 필터 상태
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actions, setActions] = useState<string[]>([]);

  // 액션 목록 로드 (필터 셀렉트용)
  useEffect(() => {
    listAuditActions().then((res) => {
      if (res.ok && Array.isArray(res.data)) setActions(res.data);
    });
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: AuditLogQuery = {
      page,
      limit: PAGE_SIZE,
    };
    if (actionFilter && actionFilter !== "all") params.action = actionFilter;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    // actorId 검색: search가 입력되면 actorId로 필터
    if (search.trim()) params.actorId = search.trim();

    const res = await listAuditLogs(params);
    if (res.ok) {
      setLogs(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
    } else {
      setError("감사로그를 불러올 수 없습니다. 백엔드 서비스를 확인하세요.");
      setLogs([]);
      setTotal(0);
    }
    setLoading(false);
  }, [page, actionFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 필터 변경 시 1페이지로 리셋
  const handleFilterChange = useCallback(() => {
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("ko-KR", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function formatDetails(details: Record<string, unknown> | string | null): string {
    if (typeof details === "string") return details;
    if (!details || Object.keys(details).length === 0) return "-";
    // JSON 객체를 읽기 좋게 표시
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          감사로그
          <HelpTooltip text="시스템 내 모든 사용자 활동을 시간순으로 기록합니다. 규정 준수(GLP/GMP) 및 연구 무결성 검증에 활용됩니다." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">모든 활동 이력 추적 및 검색 (총 {total}건)</p>
      </div>

      {/* 검색 & 필터 */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="사용자 ID 검색..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
            className="pl-10"
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); handleFilterChange(); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="활동 유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 활동</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); handleFilterChange(); }} className="w-40" />
          <span className="text-muted-foreground text-sm">~</span>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); handleFilterChange(); }} className="w-40" />
        </div>
      </div>

      {/* 테이블 */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              불러오는 중...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={fetchLogs}>재시도</Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              조건에 맞는 감사로그가 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시간</TableHead>
                  <TableHead className="flex items-center gap-1">
                    활동 <HelpTooltip text="수행된 작업의 유형입니다 (서명, 내보내기, 잠금 등)." />
                  </TableHead>
                  <TableHead>사용자</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead>상세</TableHead>
                  <TableHead className="flex items-center gap-1">
                    IP <HelpTooltip text="활동이 발생한 네트워크 주소입니다. 보안 감사 시 추적에 활용됩니다." />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${ACTION_COLORS[log.action] || "bg-muted text-muted-foreground"}`}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{log.actorId}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.entityType}/{log.entityId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {formatDetails(log.details)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ipAddress ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 페이지네이션 */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}건
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
              이전
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
