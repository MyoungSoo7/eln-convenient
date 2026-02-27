import { FileText, FlaskConical, Package, CalendarDays, ShieldCheck, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockNotes, mockBookings, mockAuditLog, mockInventory } from "@/lib/mockData";
import { Link } from "react-router-dom";

const stats = [
  { label: "연구노트", value: "24", change: "+3 이번 주", icon: FileText, color: "text-primary" },
  { label: "진행 중 실험", value: "5", change: "2 서명 대기", icon: FlaskConical, color: "text-secondary" },
  { label: "인벤토리 항목", value: "156", change: "3 재고 부족", icon: Package, color: "text-warning" },
  { label: "장비 예약", value: "8", change: "2 승인 대기", icon: CalendarDays, color: "text-info" },
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
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <p className="text-sm text-muted-foreground mt-1">연구 활동 개요 및 빠른 접근</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-card hover:shadow-elevated transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{s.label}</p>
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
              <CardTitle className="text-base font-semibold">최근 연구노트</CardTitle>
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
              <CardTitle className="text-base font-semibold">예약 일정</CardTitle>
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
            <CardTitle className="text-base font-semibold">최근 활동 로그</CardTitle>
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
            <CardTitle className="text-base font-semibold">재고 알림</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockInventory.filter(i => i.status === 'low_stock' || i.status === 'out_of_stock').map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">잔량: {item.quantity} {item.unit} · {item.location}</p>
                </div>
              </div>
            ))}
            {mockInventory.filter(i => i.status === 'low_stock' || i.status === 'out_of_stock').length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">재고 부족 항목 없음</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
