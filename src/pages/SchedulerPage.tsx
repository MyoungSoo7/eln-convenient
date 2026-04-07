import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, CalendarX, Check, ChevronLeft, ChevronRight, Clock, Edit2, MapPin, Plus, RefreshCw, Settings, Trash2, Users, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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
import { listResources, listBookings as fetchBookings, createBooking, approveBooking, rejectBooking, createResource, updateResource, deleteResource, type Resource, type BackendBooking, type CreateResourceData } from "@/api/scheduler";
import { getStoredUser } from "@/lib/authToken";

const APPROVE_ROLES = ["admin", "reviewer"];

// 업무 시간대 상수 — 캘린더 그리드와 예약 폼이 공유
const BUSINESS_HOUR_START = 8;   // 08:00
const BUSINESS_HOUR_END = 18;    // 18:00
const SLOT_MINUTES = 30;         // 예약 폼 시간 슬롯 단위

const hours = Array.from(
  { length: BUSINESS_HOUR_END - BUSINESS_HOUR_START },
  (_, i) => `${(i + BUSINESS_HOUR_START).toString().padStart(2, "0")}:00`,
);

// 예약 폼용 시간 슬롯 (08:00, 08:30, ..., 18:00) — 종료 시간 포함
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  const totalMinutes = (BUSINESS_HOUR_END - BUSINESS_HOUR_START) * 60;
  for (let m = 0; m <= totalMinutes; m += SLOT_MINUTES) {
    const h = BUSINESS_HOUR_START + Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
  }
  return slots;
})();

const statusColors: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/30",
  APPROVED: "bg-success/10 text-success border-success/30",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
  COMPLETED: "bg-muted text-muted-foreground",
};

// 캘린더 카드 좌측 보더 — 상태 표시 (자원 색 배경 위에 얹힘)
const statusBorderClass: Record<string, string> = {
  PENDING: "border-l-[3px] border-l-amber-500",
  APPROVED: "border-l-[3px] border-l-emerald-500",
  REJECTED: "border-l-[3px] border-l-red-500",
  CANCELLED: "border-l-[3px] border-l-gray-400",
  COMPLETED: "border-l-[3px] border-l-gray-400",
};

// 상태별 아이콘
const statusIcons: Record<string, typeof Clock> = {
  PENDING: Clock,
  APPROVED: Check,
  REJECTED: X,
  CANCELLED: X,
  COMPLETED: Check,
};

// 자원 ID 해시 → 파스텔 색상 (HSL). 같은 자원은 항상 같은 색
function resourceColor(id: string): { bg: string; text: string } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  const hue = h % 360;
  return {
    bg: `hsl(${hue} 70% 92%)`,
    text: `hsl(${hue} 60% 22%)`,
  };
}

// 주말 여부 (토/일)
function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

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

type StatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

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
  // 캘린더 그리드용: 현재 표시 중인 주(weekDates) 범위만 로드
  const [calendarBookings, setCalendarBookings] = useState<BackendBooking[]>([]);
  // 예약 목록용: 기간 필터 + 페이지네이션 적용
  const [listBookings, setListBookings] = useState<BackendBooking[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(1);
  const LIST_PAGE_SIZE = 20;
  const [periodFilter, setPeriodFilter] = useState<"1w" | "1m" | "3m" | "1y" | "all">("1m");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  // 자원 검색
  const [resourceSearch, setResourceSearch] = useState("");

  // 현재 시각 (캘린더 위 빨간 가로선용) — 1분마다 갱신
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  // 캘린더 시간 영역(8:00~18:00) 내에서의 픽셀 위치 — 범위 밖이면 null
  const currentTimeTopPx = useMemo(() => {
    const minutesFromStart = (now.getHours() - 8) * 60 + now.getMinutes();
    if (minutesFromStart < 0 || minutesFromStart > 600) return null;
    return (minutesFromStart / 60) * 48; // 행 높이 48px
  }, [now]);

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
  const [formEndTime, setFormEndTime] = useState("10:00");

  const weekDates = getWeekDates(weekOffset);
  const isToday = (d: Date) => formatDate(d) === formatDate(new Date());

  // 예약 시간 충돌 감지 — 캘린더용 fetch(현재 주 범위)에서 검사
  const conflictingBooking = useMemo(() => {
    if (!formResourceId || !formDate || !formStartTime || !formEndTime || formStartTime >= formEndTime) return null;
    const newStart = new Date(`${formDate}T${formStartTime}:00`).getTime();
    const newEnd = new Date(`${formDate}T${formEndTime}:00`).getTime();
    return calendarBookings.find((b) => {
      if (b.resourceId !== formResourceId) return false;
      if (!["PENDING", "APPROVED"].includes(b.status)) return false;
      const bStart = new Date(b.startAt).getTime();
      const bEnd = new Date(b.endAt).getTime();
      return newStart < bEnd && newEnd > bStart;
    }) ?? null;
  }, [calendarBookings, formResourceId, formDate, formStartTime, formEndTime]);

  // 캘린더 그리드용 booking 인덱스 (O(n) 사전 구성 → O(1) 룩업)
  const bookingIndex = useMemo(() => {
    const map = new Map<string, BackendBooking>();
    for (const b of calendarBookings) {
      if (!["PENDING", "APPROVED"].includes(b.status)) continue;
      const bDate = toLocalDate(b.startAt);
      const bStart = toLocalHHMM(b.startAt);
      const bEnd = toLocalHHMM(b.endAt);
      for (const hour of hours) {
        if (bStart <= hour && bEnd > hour) {
          map.set(`${bDate}_${hour}`, b);
        }
      }
    }
    return map;
  }, [calendarBookings]);

  // ─── 데이터 로딩: 캘린더 / 목록 / 자원을 분리해서 호출 ───────

  // 자원 + 캘린더(현재 주 범위) 로드
  const loadResourcesAndCalendar = useCallback(async () => {
    setLoading(true);
    // 주의 시작/끝 (월요일 00:00 ~ 일요일 23:59:59)
    const weekStart = new Date(weekDates[0]);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekDates[6]);
    weekEnd.setHours(23, 59, 59, 999);

    const [resRes, calRes] = await Promise.all([
      listResources(),
      fetchBookings({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
        limit: 100,
        order: 'asc',
      }),
    ]);
    if (resRes.ok) setResources(resRes.data ?? []);
    if (calRes.ok) setCalendarBookings(calRes.data ?? []);
    setLoading(false);
  // weekDates는 weekOffset에서 파생되므로 weekOffset만 의존성에 둠
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  // 예약 목록 로드 (기간/상태 필터 + 페이지네이션)
  const loadBookingList = useCallback(async () => {
    setListLoading(true);
    const params: Parameters<typeof fetchBookings>[0] = {
      page: listPage,
      limit: LIST_PAGE_SIZE,
      order: 'desc',
    };
    if (statusFilter !== "all") params.status = statusFilter;
    if (periodFilter !== "all") {
      const days = { '1w': 7, '1m': 30, '3m': 90, '1y': 365 }[periodFilter];
      const from = new Date();
      from.setDate(from.getDate() - days);
      from.setHours(0, 0, 0, 0);
      params.from = from.toISOString();
    }
    const res = await fetchBookings(params);
    if (res.ok) {
      setListBookings(res.data ?? []);
      setListTotal(res.total ?? 0);
    }
    setListLoading(false);
  }, [statusFilter, periodFilter, listPage]);

  useEffect(() => {
    loadResourcesAndCalendar();
  }, [loadResourcesAndCalendar]);

  useEffect(() => {
    loadBookingList();
  }, [loadBookingList]);

  // 필터가 바뀌면 페이지를 1로 리셋
  useEffect(() => {
    setListPage(1);
  }, [statusFilter, periodFilter]);

  // 기존 코드 호환용 — 양쪽 다 새로고침
  const loadData = useCallback(async () => {
    await Promise.all([loadResourcesAndCalendar(), loadBookingList()]);
  }, [loadResourcesAndCalendar, loadBookingList]);

  const resetForm = () => {
    setFormResourceId("");
    setFormTitle("");
    setFormDate(formatDate(new Date()));
    setFormStartTime("09:00");
    setFormEndTime("10:00");
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
      toast({ title: t('createSuccess'), description: t('createSuccessDesc', { name: newBooking.resource?.name || formResourceId }) });
      setNewBookingOpen(false);
      resetForm();
      // 캘린더(현재 주 범위)와 목록(필터/페이지네이션) 모두 새로고침
      loadData();
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

  const filteredResources = resources.filter((r) => {
    if (resourceTypeFilter !== "all" && r.type !== resourceTypeFilter) return false;
    if (resourceSearch.trim()) {
      const q = resourceSearch.trim().toLowerCase();
      const hay = `${r.name} ${r.location ?? ''} ${r.description ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

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
                    <Select
                      value={formStartTime}
                      onValueChange={(v) => {
                        setFormStartTime(v);
                        // 종료 시간이 시작 시간 이하라면 한 슬롯 뒤로 자동 보정
                        if (formEndTime <= v) {
                          const idx = TIME_SLOTS.indexOf(v);
                          const next = TIME_SLOTS[idx + 1] ?? TIME_SLOTS[TIME_SLOTS.length - 1];
                          setFormEndTime(next);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {/* 종료 슬롯(마지막)은 시작 시간으로 선택 불가 */}
                        {TIME_SLOTS.slice(0, -1).map((slot) => (
                          <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('form.endTime')}</Label>
                    <Select value={formEndTime} onValueChange={setFormEndTime}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {/* 시작 시간 이후 슬롯만 표시 */}
                        {TIME_SLOTS.filter((slot) => slot > formStartTime).map((slot) => (
                          <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {conflictingBooking && (
                  <div className="rounded-md border border-destructive bg-destructive/5 p-3 space-y-1">
                    <p className="text-sm font-medium text-destructive">{t('booking.conflict')}</p>
                    <p className="text-xs text-destructive/80">
                      {t('booking.conflictWith', { name: conflictingBooking.resource?.name || conflictingBooking.title })}
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setNewBookingOpen(false); resetForm(); }}>{tc('cancel')}</Button>
                <Button
                  onClick={handleCreate}
                  disabled={submitting || !!conflictingBooking}
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
          <div className="grid grid-cols-8 border-b bg-muted/20">
            <div className="p-3 text-xs text-muted-foreground border-r" />
            {weekDates.map((d, i) => {
              const today = isToday(d);
              const weekend = isWeekend(d);
              return (
                <div
                  key={i}
                  className={`p-3 text-center border-r last:border-r-0 ${
                    today ? "bg-primary/10" : weekend ? "bg-muted/40" : ""
                  }`}
                >
                  <p className={`text-xs ${weekend && !today ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                    {days[i]}
                  </p>
                  <p className={`text-sm font-semibold mt-0.5 ${today ? "text-primary" : ""}`}>
                    {d.getDate()}
                  </p>
                </div>
              );
            })}
          </div>
          {/* 시간 행 영역 — 현재 시각 인디케이터를 absolute로 띄우기 위해 relative */}
          <div className="relative">
            {hours.map((hour) => {
              const isLunch = hour === "12:00";
              return (
                <div
                  key={hour}
                  className={`grid grid-cols-8 border-b last:border-b-0 min-h-[48px] ${
                    isLunch ? "border-t border-t-muted-foreground/20" : ""
                  }`}
                >
                  <div className="p-2 text-xs text-muted-foreground border-r flex items-start justify-end pr-3 pt-1 bg-muted/10">
                    {hour}
                  </div>
                  {weekDates.map((d, i) => {
                    const dateStr = formatDate(d);
                    const booking = bookingIndex.get(`${dateStr}_${hour}`);
                    const isBookingStart = booking && toLocalHHMM(booking.startAt) === hour;
                    const today = isToday(d);
                    const weekend = isWeekend(d);
                    // 예약 지속 시간(시간 단위) — 행 높이(48px) × 지속시간 만큼 카드 높이 확장
                    const durationHours = isBookingStart
                      ? (new Date(booking!.endAt).getTime() - new Date(booking!.startAt).getTime()) / (1000 * 60 * 60)
                      : 0;
                    const rc = isBookingStart ? resourceColor(booking!.resourceId) : null;
                    const StatusIcon = isBookingStart ? statusIcons[booking!.status] ?? Clock : null;
                    return (
                      <div
                        key={i}
                        className={`relative border-r last:border-r-0 p-0.5 ${
                          today ? "bg-primary/5" : weekend ? "bg-muted/20" : ""
                        }`}
                      >
                        {isBookingStart && rc && StatusIcon && (
                          <div
                            className={`absolute inset-x-0.5 top-0.5 z-10 rounded ${statusBorderClass[booking!.status]} overflow-hidden shadow-sm hover:shadow-md hover:z-20 transition-shadow cursor-pointer`}
                            style={{
                              height: `calc(${durationHours * 48}px - 4px)`,
                              backgroundColor: rc.bg,
                              color: rc.text,
                            }}
                            title={`${booking!.resource?.name || booking!.resourceId}\n${booking!.title}\n${toLocalHHMM(booking!.startAt)}–${toLocalHHMM(booking!.endAt)} (${statusLabels[booking!.status]})`}
                          >
                            <div className="flex items-start justify-between gap-1 px-1.5 pt-1">
                              <p className="font-semibold text-[10px] truncate flex-1 leading-tight">
                                {booking!.resource?.name || booking!.resourceId}
                              </p>
                              <StatusIcon className="h-3 w-3 shrink-0 opacity-70" />
                            </div>
                            <p className="opacity-80 truncate text-[10px] px-1.5 leading-tight">
                              {booking!.title}
                            </p>
                            <p className="opacity-60 truncate text-[9px] px-1.5 leading-tight">
                              {toLocalHHMM(booking!.startAt)}–{toLocalHHMM(booking!.endAt)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {/* 현재 시각 인디케이터 — 오늘 컬럼에만 빨간 가로선 */}
            {currentTimeTopPx !== null && weekDates.some(isToday) && (() => {
              const todayIndex = weekDates.findIndex(isToday);
              return (
                <div
                  className="absolute pointer-events-none z-30"
                  style={{
                    top: `${currentTimeTopPx}px`,
                    left: `calc(100% / 8 * ${1 + todayIndex})`,
                    width: `calc(100% / 8)`,
                  }}
                >
                  <div className="relative h-0.5 bg-red-500">
                    <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
                  </div>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* 예약 목록 (기간 + 상태 필터 + 페이지네이션) */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              {t('bookingList')}
              <HelpTooltip text={t('bookingListTooltip')} />
              {listTotal > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">({listTotal}건)</span>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
                <SelectTrigger className="h-9 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1w">{t('period.1w')}</SelectItem>
                  <SelectItem value="1m">{t('period.1m')}</SelectItem>
                  <SelectItem value="3m">{t('period.3m')}</SelectItem>
                  <SelectItem value="1y">{t('period.1y')}</SelectItem>
                  <SelectItem value="all">{t('period.all')}</SelectItem>
                </SelectContent>
              </Select>
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="w-auto">
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs px-3">{tc('all')}</TabsTrigger>
                  <TabsTrigger value="PENDING" className="text-xs px-3">{t('status.PENDING')}</TabsTrigger>
                  <TabsTrigger value="APPROVED" className="text-xs px-3">{t('status.APPROVED')}</TabsTrigger>
                  <TabsTrigger value="REJECTED" className="text-xs px-3">{t('status.REJECTED')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">{tc('loading')}</p>
          ) : listBookings.length === 0 ? (
            <EmptyState
              icon={CalendarX}
              title={statusFilter === "all" ? t('emptyAll') : t('emptyFiltered', { status: statusLabels[statusFilter] })}
            />
          ) : (
            <div className="space-y-3">
              {listBookings.map((b) => (
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
          {/* 페이지네이션 */}
          {!listLoading && listTotal > LIST_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t">
              <span className="text-xs text-muted-foreground">
                {t('pagination.summary', {
                  from: (listPage - 1) * LIST_PAGE_SIZE + 1,
                  to: Math.min(listPage * LIST_PAGE_SIZE, listTotal),
                  total: listTotal,
                })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={listPage <= 1}
                  onClick={() => setListPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3 w-3 mr-1" /> {t('pagination.prev')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t('pagination.pageOf', {
                    page: listPage,
                    total: Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE)),
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={listPage >= Math.ceil(listTotal / LIST_PAGE_SIZE)}
                  onClick={() => setListPage((p) => p + 1)}
                >
                  {t('pagination.next')} <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
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
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="search"
                  value={resourceSearch}
                  onChange={(e) => setResourceSearch(e.target.value)}
                  placeholder={t('resource.searchPlaceholder')}
                  className="h-9 w-[200px] text-xs"
                />
                <Tabs value={resourceTypeFilter} onValueChange={(v) => setResourceTypeFilter(v as "all" | "EQUIPMENT" | "ROOM")} className="w-auto">
                  <TabsList className="h-9">
                    <TabsTrigger value="all" className="text-xs px-3">{t('resource.filterAll')}</TabsTrigger>
                    <TabsTrigger value="EQUIPMENT" className="text-xs px-3">{t('type.EQUIPMENT')}</TabsTrigger>
                    <TabsTrigger value="ROOM" className="text-xs px-3">{t('type.ROOM')}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">{tc('loading')}</p>
            ) : filteredResources.length === 0 ? (
              <EmptyState
                icon={Settings}
                title={t('resource.empty')}
              />
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
