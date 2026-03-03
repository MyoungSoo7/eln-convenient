import { FileText, FlaskConical, Package, CalendarDays, ShieldCheck, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockNotes, mockBookings, mockAuditLog, mockInventory } from "@/lib/mockData";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";

const stats = [
  { label: "연구노트", value: "24", change: "+3 이번 주", icon: FileText, color: "text-primary", help: "작성된 전체 연구노트 수입니다. 클릭하면 노트 목록으로 이동합니다." },
  { label: "진행 중 실험", value: "5", change: "2 서명 대기", icon: FlaskConical, color: "text-secondary", help: "현재 진행 중인 실험 노트와 서명 대기 중인 노트 수를 표시합니다." },
  { label: "인벤토리 항목", value: "156", change: "3 재고 부족", icon: Package, color: "text-warning", help: "등록된 시약, 샘플, 장비의 총 수량입니다. 재고 부족 항목을 확인하세요." },
  { label: "장비 예약", value: "8", change: "2 승인 대기", icon: CalendarDays, color: "text-info", help: "금주 장비/회의실 예약 건수와 승인 대기 중인 예약을 보여줍니다." },
];

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  draft: "초안",
  in_progress: "진행 중",
  signed: "서명 완료",
  locked: "잠김",
};

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          대시보드
          <HelpTooltip text="연구 활동의 주요 지표와 최근 변경 사항을 한눈에 확인할 수 있는 종합 현황판입니다." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">연구 활동 개요 및 빠른 접근</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-card hover:shadow-elevated transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    {s.label}
                    <HelpTooltip text={s.help} side="right" />
                  </p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.change}</p>
                </div>
                <div className={`p-2 rounded-lg bg-muted ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Notes */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                최근 연구노트
                <HelpTooltip text="최근에 수정된 연구노트 4개를 보여줍니다. 클릭하면 노트 편집기로 이동합니다." />
              </CardTitle>
              <Link to="/notes" className="text-xs text-primary hover:underline">전체 보기</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockNotes.slice(0, 4).map((note) => (
              <Link key={note.id} to={`/notes/${note.id}`} className="flex items-start justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{note.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{note.author}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{note.updatedAt}</span>
                  </div>
                </div>
                <Badge variant="secondary" className={`text-[10px] shrink-0 ${statusColors[note.status]}`}>
                  {statusLabels[note.status]}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Bookings */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                예약 일정
                <HelpTooltip text="예정된 장비 및 회의실 예약 목록입니다. 승인/대기 상태를 확인할 수 있습니다." />
              </CardTitle>
              <Link to="/scheduler" className="text-xs text-primary hover:underline">전체 보기</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockBookings.slice(0, 4).map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className={`p-2 rounded-lg ${b.status === 'approved' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{b.resourceName}</p>
                  <p className="text-xs text-muted-foreground">{b.date} {b.startTime}–{b.endTime} · {b.user}</p>
                </div>
                <Badge variant="secondary" className={`text-[10px] ${b.status === 'approved' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                  {b.status === 'approved' ? '승인' : '대기'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Audit Activity */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              최근 활동 로그
              <HelpTooltip text="시스템 내 모든 사용자의 최근 활동 기록입니다. 서명, 편집, 예약 등의 이력을 추적합니다." />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockAuditLog.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="p-2 rounded-lg bg-muted">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{a.action}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.details}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.user} · {a.timestamp}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              만료/주의 항목
              <HelpTooltip text="만료되었거나 보관 상태인 장비·라이선스·산출물을 표시합니다." />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockInventory.filter(i => i.status === 'expired' || i.status === 'archived').map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} · {item.location}</p>
                </div>
              </div>
            ))}
            {mockInventory.filter(i => i.status === 'expired' || i.status === 'archived').length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">만료/주의 항목 없음</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
