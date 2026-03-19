import { FileText, FlaskConical, Package, CalendarDays, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getDashboardData } from "@/api/dashboard";
import { mockNotes, mockBookings, mockAuditLog, mockInventory } from "@/lib/mockData";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};

export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation('common');

  const { data: dashboardRes, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboardData,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const apiData = dashboardRes?.ok ? dashboardRes.data : null;

  // stats 카드: API 데이터 우선, fallback mock
  const noteTotal = apiData?.notes?.total ?? mockNotes.length;
  const noteInProgress = apiData?.notes?.in_progress ?? mockNotes.filter(n => n.status === 'in_progress').length;
  const invTotal = apiData?.inventory?.total ?? mockInventory.length;
  const pendingBookings = apiData?.scheduler?.pendingBookings ?? mockBookings.filter(b => b.status === 'pending').length;

  const stats = [
    { label: t('stats.notes'), value: String(noteTotal), change: t('stats.notesChange'), icon: FileText, color: "text-primary", help: "작성된 전체 연구노트 수입니다." },
    { label: t('stats.experiments'), value: String(noteInProgress), change: t('stats.experimentsChange'), icon: FlaskConical, color: "text-secondary", help: "현재 진행 중인 실험 노트 수입니다." },
    { label: t('stats.inventory'), value: String(invTotal), change: t('stats.inventoryChange'), icon: Package, color: "text-warning", help: "등록된 시약, 샘플, 장비의 총 수량입니다." },
    { label: t('stats.bookings'), value: String(pendingBookings), change: t('stats.bookingsChange'), icon: CalendarDays, color: "text-info", help: "승인 대기 중인 예약 건수입니다." },
  ];

  // 최근 노트: API → mock fallback
  const recentNotes = apiData?.recentNotes?.length
    ? apiData.recentNotes.slice(0, 4)
    : mockNotes.slice(0, 4);

  // 예약 일정: API → mock fallback
  const upcomingBookings = apiData?.upcomingBookings?.length
    ? apiData.upcomingBookings.slice(0, 4)
    : null;
  const bookingsFromMock = !upcomingBookings ? mockBookings.slice(0, 4) : null;

  // 감사로그: API → mock fallback
  const auditLogs = apiData?.recentActivity?.length
    ? apiData.recentActivity.slice(0, 4)
    : null;
  const auditFromMock = !auditLogs ? mockAuditLog.slice(0, 4) : null;

  // 만료/주의 항목: API → mock fallback
  const alertItems = [
    ...(apiData?.lowStockItems ?? []),
    ...(apiData?.expiringItems ?? []),
  ];
  const hasAlertItems = alertItems.length > 0;
  const alertFromMock = !hasAlertItems
    ? mockInventory.filter(i => i.status === 'expired' || i.status === 'depleted')
    : null;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          {t('title')}
          <HelpTooltip text={t('titleTooltip')} />
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        {isError && (
          <p className="text-xs text-destructive mt-1">서버 연결 실패 — 임시 데이터를 표시합니다.</p>
        )}
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
                {t('recentNotes')}
                <HelpTooltip text="최근에 수정된 연구노트 4개를 보여줍니다." />
              </CardTitle>
              <Link to="/notes" className="text-xs text-primary hover:underline">{t('viewAll')}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentNotes.map((note) => (
              <Link key={note.id} to={`/notes/${note.id}`} className="flex items-start justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{note.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{note.author ?? note.authorId}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{note.updatedAt}</span>
                  </div>
                </div>
                <Badge variant="secondary" className={`text-[10px] shrink-0 ${statusColors[note.status]}`}>
                  {tc(`status.${note.status}`)}
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
            {upcomingBookings ? upcomingBookings.map((b) => {
              const startDate = new Date(b.startAt);
              const endDate = new Date(b.endAt);
              const dateStr = startDate.toLocaleDateString('ko-KR');
              const startTime = startDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
              const endTime = endDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
              const isApproved = b.status === 'APPROVED';
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`p-2 rounded-lg ${isApproved ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.resource?.name ?? b.title}</p>
                    <p className="text-xs text-muted-foreground">{dateStr} {startTime}–{endTime} · {b.userId}</p>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] ${isApproved ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    {isApproved ? '승인' : '대기'}
                  </Badge>
                </div>
              );
            }) : bookingsFromMock?.map((b) => (
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
            {auditLogs ? auditLogs.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="p-2 rounded-lg bg-muted">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{a.action}</p>
                  <p className="text-xs text-muted-foreground truncate">{typeof a.details === 'string' ? a.details : (a.details?.error || a.details?.changedFields?.join(', ') || JSON.stringify(a.details))}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.userId ?? a.actorId} · {new Date(a.createdAt).toLocaleString('ko-KR')}</p>
                </div>
              </div>
            )) : auditFromMock?.map((a) => (
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

        {/* Low Stock / Expiring Alerts */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              만료/주의 항목
              <HelpTooltip text="재고 부족이거나 만료 임박/만료된 항목을 표시합니다." />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasAlertItems ? alertItems.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity != null && `${item.quantity} ${item.unit ?? ''}`}
                    {item.location && ` · ${item.location}`}
                    {'daysLeft' in item && ` · ${(item as any).isExpired ? '만료됨' : `${(item as any).daysLeft}일 남음`}`}
                  </p>
                </div>
              </div>
            )) : alertFromMock && alertFromMock.length > 0 ? alertFromMock.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} · {item.location}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">만료/주의 항목 없음</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
