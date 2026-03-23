import { FileText, FlaskConical, Package, CalendarDays, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getDashboardData } from "@/api/dashboard";

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

  // stats 카드: API 데이터 우선, 없으면 0
  const noteTotal = apiData?.notes?.total ?? 0;
  const noteInProgress = apiData?.notes?.in_progress ?? 0;
  const invTotal = apiData?.inventory?.total ?? 0;
  const pendingBookings = apiData?.scheduler?.pendingBookings ?? 0;

  const stats = [
    { label: t('stats.notes'), value: String(noteTotal), change: t('stats.notesChange'), icon: FileText, color: "text-primary", help: t('stats.notesTooltip') },
    { label: t('stats.experiments'), value: String(noteInProgress), change: t('stats.experimentsChange'), icon: FlaskConical, color: "text-secondary", help: t('stats.experimentsTooltip') },
    { label: t('stats.inventory'), value: String(invTotal), change: t('stats.inventoryChange'), icon: Package, color: "text-warning", help: t('stats.inventoryTooltip') },
    { label: t('stats.bookings'), value: String(pendingBookings), change: t('stats.bookingsChange'), icon: CalendarDays, color: "text-info", help: t('stats.bookingsTooltip') },
  ];

  // 최근 노트
  const recentNotes = apiData?.recentNotes?.slice(0, 4) ?? [];

  // 예약 일정
  const upcomingBookings = apiData?.upcomingBookings?.slice(0, 4) ?? [];

  // 감사로그
  const auditLogs = apiData?.recentActivity?.slice(0, 4) ?? [];

  // 만료/주의 항목
  const alertItems = [
    ...(apiData?.lowStockItems ?? []),
    ...(apiData?.expiringItems ?? []),
  ];

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
          <p className="text-xs text-destructive mt-1">{tc('error.serverFallback')}</p>
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
                <HelpTooltip text={t('recentNotesTooltip')} />
              </CardTitle>
              <Link to="/notes" className="text-xs text-primary hover:underline">{t('viewAll')}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentNotes.length > 0 ? recentNotes.map((note) => (
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
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('emptyNotes')}</p>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Bookings */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                {t('bookings_section')}
                <HelpTooltip text={t('bookingsTooltip')} />
              </CardTitle>
              <Link to="/scheduler" className="text-xs text-primary hover:underline">{t('viewAll')}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingBookings.length > 0 ? upcomingBookings.map((b) => {
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
                    {isApproved ? t('approved') : t('pending')}
                  </Badge>
                </div>
              );
            }) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('emptyBookings')}</p>
            )}
          </CardContent>
        </Card>

        {/* Audit Activity */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {t('recentActivity')}
              <HelpTooltip text={t('recentActivityTooltip')} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditLogs.length > 0 ? auditLogs.map((a) => (
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
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noActivity')}</p>
            )}
          </CardContent>
        </Card>

        {/* Low Stock / Expiring Alerts */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {t('alerts')}
              <HelpTooltip text={t('alertsTooltip')} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertItems.length > 0 ? alertItems.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity != null && `${item.quantity} ${item.unit ?? ''}`}
                    {item.location && ` · ${item.location}`}
                    {'daysLeft' in item && ` · ${(item as any).isExpired ? t('isExpired') : t('daysLeft', { count: (item as any).daysLeft })}`}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noAlerts')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
