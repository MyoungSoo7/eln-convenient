import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "@/hooks/use-toast";
import { listResources, listBookings, createBooking, type Resource, type BackendBooking } from "@/api/scheduler";

const days = ["월", "화", "수", "목", "금", "토", "일"];
const hours = Array.from({ length: 10 }, (_, i) => `${(i + 8).toString().padStart(2, "0")}:00`);

const statusLabels: Record<string, string> = {
  pending: "대기", approved: "승인", rejected: "거절", cancelled: "취소",
};
const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};
const typeLabels: Record<string, string> = { equipment: "장비", room: "회의실" };

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

type StatusFilter = "all" | "pending" | "approved";

export default function SchedulerPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<BackendBooking[]>([]);
  const [loading, setLoading] = useState(true);

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
      toast({ title: "장비/회의실을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!formTitle.trim()) {
      toast({ title: "예약 목적을 입력해주세요.", variant: "destructive" });
      return;
    }
    if (formStartTime >= formEndTime) {
      toast({ title: "종료 시간이 시작 시간보다 늦어야 합니다.", variant: "destructive" });
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
      toast({ title: "예약 생성 완료", description: `${newBooking.resource?.name || formResourceId} 예약이 등록되었습니다. (대기 중)` });
      setNewBookingOpen(false);
      resetForm();
    } else {
      toast({ title: "예약 실패", description: res.error || "예약 생성에 실패했습니다.", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            스케줄러
            <HelpTooltip text="장비, 회의실 등 공유 자원의 예약을 관리하는 캘린더입니다. 주간 뷰로 예약 현황을 확인하고 새 예약을 생성할 수 있습니다." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">장비 및 회의실 예약 관리</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> 새로고침
          </Button>
          <Dialog open={newBookingOpen} onOpenChange={(open) => { setNewBookingOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground gap-2">
                <Plus className="h-4 w-4" /> 예약 생성
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  예약 생성
                  <HelpTooltip text="장비 또는 회의실을 선택하고 날짜, 시간, 사용 목적을 입력하여 예약을 생성합니다. 관리자 승인 후 확정됩니다." />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>장비 / 회의실 <span className="text-destructive">*</span></Label>
                  <Select value={formResourceId} onValueChange={setFormResourceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {resources.length === 0 ? (
                        <SelectItem value="_none" disabled>자원이 없습니다</SelectItem>
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
                  <Label>예약 목적 <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="예: CRISPR 실험 장비 사용"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>날짜 <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={formDate}
                    min={formatDate(new Date())}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>시작 시간</Label>
                    <Input
                      type="time"
                      value={formStartTime}
                      step="600"
                      onChange={(e) => setFormStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>종료 시간</Label>
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
                <Button variant="outline" onClick={() => { setNewBookingOpen(false); resetForm(); }}>취소</Button>
                <Button
                  onClick={handleCreate}
                  disabled={submitting}
                  className="gradient-primary text-primary-foreground"
                >
                  {submitting ? "처리 중..." : "예약하기"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 주간 네비게이션 */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>오늘</Button>
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
        <HelpTooltip text="화살표로 이전/다음 주를 탐색하고, '오늘' 버튼으로 현재 주로 돌아옵니다." />
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
                  if (!["pending", "approved"].includes(b.status)) return false;
                  const bDate = toLocalDate(b.startTime);
                  const bStart = toLocalHHMM(b.startTime);
                  const bEnd = toLocalHHMM(b.endTime);
                  return bDate === dateStr && bStart <= hour && bEnd > hour;
                });
                return (
                  <div key={i} className={`border-r last:border-r-0 p-0.5 ${isToday(d) ? "bg-primary/5" : ""}`}>
                    {booking && toLocalHHMM(booking.startTime) === hour && (
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
              예약 목록
              <HelpTooltip text="모든 예약의 상세 목록입니다. 전체·대기·승인 상태별로 필터링할 수 있습니다." />
              {bookings.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">({bookings.length}건)</span>
              )}
            </CardTitle>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="w-auto">
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs px-3">전체</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs px-3">대기</TabsTrigger>
                <TabsTrigger value="approved" className="text-xs px-3">승인</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">로딩 중...</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {statusFilter === "all" ? "예약이 없습니다. 새 예약을 생성해보세요." : `'${statusFilter === "pending" ? "대기" : "승인"}' 상태 예약이 없습니다.`}
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
                      {toLocalDate(b.startTime)} · {toLocalHHMM(b.startTime)}–{toLocalHHMM(b.endTime)}
                    </p>
                  </div>
                  <Badge className={`text-[10px] shrink-0 ${statusColors[b.status]}`}>
                    {statusLabels[b.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
