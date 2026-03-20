import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Edit2, MapPin, Plus, RefreshCw, Settings, Trash2, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "@/hooks/use-toast";
import { listResources, listBookings, createBooking, approveBooking, rejectBooking, createResource, updateResource, deleteResource, type Resource, type BackendBooking, type CreateResourceData } from "@/api/scheduler";
import { getStoredUser } from "@/lib/authToken";

const APPROVE_ROLES = ["admin", "reviewer"];

const hours = Array.from({ length: 10 }, (_, i) => `${(i + 8).toString().padStart(2, "0")}:00`);

const statusColors: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/30",
  APPROVED: "bg-success/10 text-success border-success/30",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
  COMPLETED: "bg-muted text-muted-foreground",
};

// ISO datetime → "YYYY-MM-DD" (로컬 시간 기준)
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

// ISO datetime → "HH:MM" (로컬 시간 기준)
function toLocalHHMM(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function getWeekDates(offset: number): Date[] {
  const today = new Date();
  const start = new Date(today);
  // 월요일 기준 주
  const day = today.getDay() === 0 ? 6 : today.getDay() - 1;
  start.setDate(today.getDate() - day + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

type StatusFilter = "all" | "PENDING" | "APPROVED";

export default function SchedulerPage() {
  const { t } = useTranslation('scheduler');
  const { t: tc } = useTranslation('common');

  const days = [t('days.mon'), t('days.tue'), t('days.wed'), t('days.thu'), t('days.fri'), t('days.sat'), t('days.sun')];
  const statusLabels: Record<string, string> = {
    PENDING: t('status.PENDING'), APPROVED: t('status.APPROVED'), REJECTED: t('status.REJECTED'), CANCELLED: t('status.CANCELLED'), COMPLETED: t('status.COMPLETED'),
  };
  const typeLabels: Record<string, string> = { EQUIPMENT: t('type.EQUIPMENT'), ROOM: t('type.ROOM') };

  const [weekOffset, setWeekOffset] = useState(0);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<BackendBooking[]>([]);
  const [loading, setLoading] = useState(true);

  // 승인/반려 권한 확인
  const storedUser = getStoredUser();
  const userRole = (storedUser?.role as string) ?? "";
  const canApprove = APPROVE_ROLES.includes(userRole);

  const isAdmin = userRole === "admin";

  // 페이지 탭 (예약 / 자원 관리)
  const [pageTab, setPageTab] = useState<"booking" | "resources">("booking");

  // 반려 사유 다이얼로그
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // 자원 관리 상태
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [resourceTypeFilter, setResourceTypeFilter] = useState<"all" | "EQUIPMENT" | "ROOM">("all");
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resFormName, setResFormName] = useState("");
  const [resFormType, setResFormType] = useState<"EQUIPMENT" | "ROOM">("EQUIPMENT");
  const [resFormLocation, setResFormLocation] = useState("");
  const [resFormDescription, setResFormDescription] = useState("");
  const [resFormCapacity, setResFormCapacity] = useState("");

  // 예약 폼
  const [formResourceId, setFormResourceId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(formatDate(new Date()));
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("12:00");

  const weekDates = getWeekDates(weekOffset);
  const isToday = (d: Date) => formatDate(d) === formatDate(new Date());

  // 자원 + 예약 목록 로드 (상태 필터: 전체/대기/승인)
  const loadData = useCallback(async () => {
    setLoading(true);
    const [resRes, bookRes] = await Promise.all([
      listResources(),
      listBookings({
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        limit: 200,
      }),
    ]);
    if (resRes.ok) setResources(resRes.data ?? []);
    if (bookRes.ok) setBookings(bookRes.data ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setFormResourceId("");
    setFormTitle("");
    setFormDate(formatDate(new Date()));
    setFormStartTime("09:00");
    setFormEndTime("12:00");
  };

  const handleCreate = async () => {
    if (!formResourceId) {
      toast({ title: t('form.selectResource'), variant: "destructive" });
      return;
    }
    if (!formTitle.trim()) {
      toast({ title: t('form.enterPurpose'), variant: "destructive" });
      return;
    }
    if (formStartTime >= formEndTime) {
      toast({ title: t('form.invalidTime'), variant: "destructive" });
      return;
    }

    const startTime = new Date(`${formDate}T${formStartTime}:00`).toISOString();
    const endTime = new Date(`${formDate}T${formEndTime}:00`).toISOString();

    setSubmitting(true);
    const res = await createBooking({ resourceId: formResourceId, title: formTitle, startTime, endTime });
    setSubmitting(false);

    if (res.ok && res.data) {
      const newBooking = res.data as BackendBooking;
      setBookings((prev) => [newBooking, ...prev]);
      toast({ title: t('createSuccess'), description: t('createSuccessDesc', { name: newBooking.resource?.name || formResourceId }) });
      setNewBookingOpen(false);
      resetForm();
    } else {
      toast({ title: t('createFailed'), description: res.error || t('createFailedDesc'), variant: "destructive" });
    }
  };

  // ─── 자원 관리 핸들러 ────────────────────────────────────
  const resetResourceForm = () => {
    setResFormName("");
    setResFormType("EQUIPMENT");
    setResFormLocation("");
    setResFormDescription("");
    setResFormCapacity("");
    setEditingResource(null);
  };

  const openEditResource = (r: Resource) => {
    setEditingResource(r);
    setResFormName(r.name);
    setResFormType(r.type);
    setResFormLocation(r.location ?? "");
    setResFormDescription(r.description ?? "");
    setResFormCapacity(r.capacity != null ? String(r.capacity) : "");
    setResourceDialogOpen(true);
  };

  const handleSaveResource = async () => {
    if (!resFormName.trim()) {
      toast({ title: t('resource.name'), description: t('form.enterPurpose'), variant: "destructive" });
      return;
    }
    setResourceSaving(true);
    const payload: CreateResourceData = {
      name: resFormName.trim(),
      type: resFormType,
      ...(resFormLocation.trim() ? { location: resFormLocation.trim() } : {}),
      ...(resFormDescription.trim() ? { description: resFormDescription.trim() } : {}),
      ...(resFormType === "ROOM" && resFormCapacity ? { capacity: parseInt(resFormCapacity, 10) } : {}),
    };

    if (editingResource) {
      const res = await updateResource(editingResource.id, payload);
      setResourceSaving(false);
      if (res.ok) {
        toast({ title: t('resource.updateSuccess'), description: t('resource.updateSuccessDesc', { name: resFormName }) });
        setResourceDialogOpen(false);
        resetResourceForm();
        loadData();
      } else {
        toast({ title: t('resource.saveFailed'), description: res.error, variant: "destructive" });
      }
    } else {
      const res = await createResource(payload);
      setResourceSaving(false);
      if (res.ok) {
        toast({ title: t('resource.createSuccess'), description: t('resource.createSuccessDesc', { name: resFormName }) });
        setResourceDialogOpen(false);
        resetResourceForm();
        loadData();
      } else {
        toast({ title: t('resource.saveFailed'), description: res.error, variant: "destructive" });
      }
    }
  };

  const handleDeleteResource = async (id: string) => {
    const res = await deleteResource(id);
    if (res.ok) {
      toast({ title: t('resource.deleteSuccess'), description: t('resource.deleteSuccessDesc') });
      loadData();
    } else {
      toast({ title: t('resource.deleteFailed'), description: res.error || t('resource.hasActiveBookings'), variant: "destructive" });
    }
  };

  const filteredResources = resources.filter((r) =>
    resourceTypeFilter === "all" ? true : r.type === resourceTypeFilter
  );

  const handleApprove = async (id: string) => {
    const res = await approveBooking(id);
    if (res.ok) {
      toast({ title: t('approveSuccess'), description: t('approveSuccessDesc') });
      loadData();
    } else {
      toast({ title: t('approveFailed'), description: res.error || t('approveFailedDesc'), variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const res = await rejectBooking(rejectTarget, rejectReason || undefined);
    if (res.ok) {
      toast({ title: t('rejectSuccess'), description: t('rejectSuccessDesc') });
      loadData();
    } else {
      toast({ title: t('rejectFailed'), description: res.error || t('rejectFailedDesc'), variant: "destructive" });
    }
    setRejectTarget(null);
    setRejectReason("");
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {t('title')}
            <HelpTooltip text={t('titleTooltip')} />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> {tc('refresh')}
          </Button>
          {pageTab === "booking" && (
          <Dialog open={newBookingOpen} onOpenChange={(open) => { setNewBookingOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground gap-2">
                <Plus className="h-4 w-4" /> {t('newBooking')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {t('form.title')}
                  <HelpTooltip text={t('form.tooltip')} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t('form.resource')} <span className="text-destructive">*</span></Label>
                  <Select value={formResourceId} onValueChange={setFormResourceId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('form.resourcePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {resources.length === 0 ? (
                        <SelectItem value="_none" disabled>{t('form.noResources')}</SelectItem>
                      ) : (
                        resources.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            <span className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">{typeLabels[r.type] || r.type}</Badge>
                              {r.name}
                              {r.location && <span className="text-muted-foreground text-xs">· {r.location}</span>}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('form.purpose')} <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder={t('form.purposePlaceholder')}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('form.date')} <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={formDate}
                    min={formatDate(new Date())}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('form.startTime')}</Label>
                    <Input
                      type="time"
                      value={formStartTime}
                      step="600"
                      onChange={(e) => setFormStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('form.endTime')}</Label>
                    <Input
                      type="time"
                      value={formEndTime}
                      step="600"
                      onChange={(e) => setFormEndTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setNewBookingOpen(false); resetForm(); }}>{tc('cancel')}</Button>
                <Button
                  onClick={handleCreate}
                  disabled={submitting}
                  className="gradient-primary text-primary-foreground"
                >
                  {submitting ? tc('processing') : t('form.submit')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
          {pageTab === "resources" && isAdmin && (
            <Button
              className="gradient-primary text-primary-foreground gap-2"
              onClick={() => { resetResourceForm(); setResourceDialogOpen(true); }}
            >
              <Plus className="h-4 w-4" /> {t('resource.create')}
            </Button>
          )}
        </div>
      </div>

      {/* 페이지 탭 */}
      {isAdmin && (
        <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as "booking" | "resources")}>
          <TabsList className="h-9">
            <TabsTrigger value="booking" className="text-xs px-4 gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> {t('bookingList')}
            </TabsTrigger>
            <TabsTrigger value="resources" className="text-xs px-4 gap-1.5">
              <Settings className="h-3.5 w-3.5" /> {t('resource.manage')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {pageTab === "booking" && (<>
      {/* 주간 네비게이션 */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>{t('today')}</Button>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {weekDates[0].getMonth() + 1}월 {weekDates[0].getDate()}일 –{" "}
          {weekDates[6].getMonth() + 1}월 {weekDates[6].getDate()}일
        </span>
        <HelpTooltip text={t('weekNavTooltip')} />
      </div>

      {/* 캘린더 그리드 */}
      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-8 border-b">
            <div className="p-3 text-xs text-muted-foreground border-r" />
            {weekDates.map((d, i) => (
              <div key={i} className={`p-3 text-center border-r last:border-r-0 ${isToday(d) ? "bg-primary/5" : ""}`}>
                <p className="text-xs text-muted-foreground">{days[i]}</p>
                <p className={`text-sm font-semibold mt-0.5 ${isToday(d) ? "text-primary" : ""}`}>{d.getDate()}</p>
              </div>
            ))}
          </div>
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b last:border-b-0 min-h-[48px]">
              <div className="p-2 text-xs text-muted-foreground border-r flex items-start justify-end pr-3 pt-1">
                {hour}
              </div>
              {weekDates.map((d, i) => {
                const dateStr = formatDate(d);
                const booking = bookings.find((b) => {
                  if (!["PENDING", "APPROVED"].includes(b.status)) return false;
                  const bDate = toLocalDate(b.startAt);
                  const bStart = toLocalHHMM(b.startAt);
                  const bEnd = toLocalHHMM(b.endAt);
                  return bDate === dateStr && bStart <= hour && bEnd > hour;
                });
                return (
                  <div key={i} className={`border-r last:border-r-0 p-0.5 ${isToday(d) ? "bg-primary/5" : ""}`}>
                    {booking && toLocalHHMM(booking.startAt) === hour && (
                      <div className={`rounded p-1.5 text-[10px] border ${statusColors[booking.status]}`}>
                        <p className="font-medium truncate">
                          {booking.resource?.name || booking.resourceId}
                        </p>
                        <p className="opacity-70 truncate">{booking.title}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 예약 목록 (승인/대기 상태 필터) */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              {t('bookingList')}
              <HelpTooltip text={t('bookingListTooltip')} />
              {bookings.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">({bookings.length}건)</span>
              )}
            </CardTitle>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="w-auto">
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs px-3">{tc('all')}</TabsTrigger>
                <TabsTrigger value="PENDING" className="text-xs px-3">{t('status.PENDING')}</TabsTrigger>
                <TabsTrigger value="APPROVED" className="text-xs px-3">{t('status.APPROVED')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">{tc('loading')}</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {statusFilter === "all" ? t('emptyAll') : t('emptyFiltered', { status: statusLabels[statusFilter] })}
            </p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`p-2 rounded-lg ${statusColors[b.status]}`}>
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{b.resource?.name || b.resourceId}</p>
                      {b.resource?.type && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {typeLabels[b.resource.type] || b.resource.type}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{b.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {toLocalDate(b.startAt)} · {toLocalHHMM(b.startAt)}–{toLocalHHMM(b.endAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canApprove && b.status === "PENDING" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-success border-success/30 hover:bg-success/10"
                          onClick={() => handleApprove(b.id)}
                        >
                          <Check className="h-3 w-3 mr-1" /> {t('approve')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setRejectTarget(b.id)}
                        >
                          <X className="h-3 w-3 mr-1" /> {t('rejectBtn')}
                        </Button>
                      </>
                    )}
                    <Badge className={`text-[10px] ${statusColors[b.status]}`}>
                      {statusLabels[b.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      </>)}

      {/* 자원 관리 탭 */}
      {pageTab === "resources" && isAdmin && (
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                {t('resource.manage')}
                <HelpTooltip text={t('resource.manageTooltip')} />
                {resources.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">({filteredResources.length}건)</span>
                )}
              </CardTitle>
              <Tabs value={resourceTypeFilter} onValueChange={(v) => setResourceTypeFilter(v as "all" | "EQUIPMENT" | "ROOM")} className="w-auto">
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs px-3">{t('resource.filterAll')}</TabsTrigger>
                  <TabsTrigger value="EQUIPMENT" className="text-xs px-3">{t('type.EQUIPMENT')}</TabsTrigger>
                  <TabsTrigger value="ROOM" className="text-xs px-3">{t('type.ROOM')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">{tc('loading')}</p>
            ) : filteredResources.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('resource.empty')}</p>
            ) : (
              <div className="space-y-3">
                {filteredResources.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`p-2 rounded-lg ${r.type === 'ROOM' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'}`}>
                      {r.type === 'ROOM' ? <Users className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {typeLabels[r.type] || r.type}
                        </Badge>
                        {r.isActive === false && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                            {t('resource.inactive')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {r.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {r.location}
                          </span>
                        )}
                        {r.type === 'ROOM' && r.capacity != null && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {t('resource.persons', { count: r.capacity })}
                          </span>
                        )}
                        {r.description && <span className="truncate">{r.description}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => openEditResource(r)}
                      >
                        <Edit2 className="h-3 w-3 mr-1" /> {t('resource.edit')}
                      </Button>
                      {r.isActive !== false && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                              <Trash2 className="h-3 w-3 mr-1" /> {t('resource.deactivate')}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('resource.deactivate')}</AlertDialogTitle>
                              <AlertDialogDescription>{t('resource.deactivateConfirm')}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDeleteResource(r.id)}
                              >
                                {t('resource.deactivate')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 자원 등록/수정 다이얼로그 */}
      <Dialog open={resourceDialogOpen} onOpenChange={(open) => { setResourceDialogOpen(open); if (!open) resetResourceForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingResource ? t('resource.edit') : t('resource.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('type.EQUIPMENT')} / {t('type.ROOM')} <span className="text-destructive">*</span></Label>
              <RadioGroup value={resFormType} onValueChange={(v) => setResFormType(v as "EQUIPMENT" | "ROOM")} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="EQUIPMENT" id="res-type-eq" />
                  <Label htmlFor="res-type-eq" className="font-normal cursor-pointer">{t('type.EQUIPMENT')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ROOM" id="res-type-room" />
                  <Label htmlFor="res-type-room" className="font-normal cursor-pointer">{t('type.ROOM')}</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>{t('resource.name')} <span className="text-destructive">*</span></Label>
              <Input
                placeholder={t('resource.namePlaceholder')}
                value={resFormName}
                onChange={(e) => setResFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('resource.location')}</Label>
              <Input
                placeholder={t('resource.locationPlaceholder')}
                value={resFormLocation}
                onChange={(e) => setResFormLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('resource.description')}</Label>
              <Textarea
                placeholder={t('resource.descriptionPlaceholder')}
                value={resFormDescription}
                onChange={(e) => setResFormDescription(e.target.value)}
                rows={2}
              />
            </div>
            {resFormType === "ROOM" && (
              <div className="space-y-2">
                <Label>{t('resource.capacity')}</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder={t('resource.capacityPlaceholder')}
                  value={resFormCapacity}
                  onChange={(e) => setResFormCapacity(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResourceDialogOpen(false); resetResourceForm(); }}>{tc('cancel')}</Button>
            <Button
              onClick={handleSaveResource}
              disabled={resourceSaving}
              className="gradient-primary text-primary-foreground"
            >
              {resourceSaving ? tc('processing') : editingResource ? t('resource.edit') : t('resource.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 반려 사유 다이얼로그 */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Label>{t('rejectLabel')}</Label>
            <Input
              placeholder={t('rejectPlaceholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={handleReject}>{t('rejectBtn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
