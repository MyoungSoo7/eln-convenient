import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Clock } from "lucide-react";
import { mockBookings } from "@/lib/mockData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTooltip } from "@/components/HelpTooltip";

const days = ["일", "월", "화", "수", "목", "금", "토"];
const hours = Array.from({ length: 10 }, (_, i) => `${(i + 8).toString().padStart(2, "0")}:00`);
const statusLabels: Record<string, string> = { pending: "대기", approved: "승인", rejected: "거절", cancelled: "취소" };
const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30", approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive", cancelled: "bg-muted text-muted-foreground",
};

function getWeekDates(offset: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function SchedulerPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const weekDates = getWeekDates(weekOffset);

  const formatDate = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  const isToday = (d: Date) => formatDate(d) === formatDate(new Date());

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            스케줄러
            <HelpTooltip text="장비, 회의실 등 공유 자원의 예약을 관리하는 캘린더입니다. 주간 뷰로 예약 현황을 확인하고 새 예약을 생성할 수 있습니다." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">장비 및 회의실 예약 관리</p>
        </div>
        <Dialog open={newBookingOpen} onOpenChange={setNewBookingOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground gap-2"><Plus className="h-4 w-4" /> 예약 생성</Button>
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
                <Label>장비 / 회의실</Label>
                <Select><SelectTrigger><SelectValue placeholder="선택하세요" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neon">Neon Transfection System</SelectItem>
                    <SelectItem value="facs">BD FACSCanto II</SelectItem>
                    <SelectItem value="confocal">Confocal Microscope</SelectItem>
                    <SelectItem value="room">A동 세미나실</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input type="date" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>시작 시간</Label>
                  <Input type="time" defaultValue="09:00" step="600" />
                </div>
                <div className="space-y-2">
                  <Label>종료 시간</Label>
                  <Input type="time" defaultValue="12:00" step="600" />
                </div>
              </div>
              <div className="space-y-2"><Label>목적</Label><Input placeholder="사용 목적" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewBookingOpen(false)}>취소</Button>
              <Button onClick={() => { setNewBookingOpen(false); }} className="gradient-primary text-primary-foreground">예약하기</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>오늘</Button>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset + 1)}><ChevronRight className="h-4 w-4" /></Button>
        <span className="text-sm font-medium">
          {weekDates[0].getMonth() + 1}월 {weekDates[0].getDate()}일 – {weekDates[6].getMonth() + 1}월 {weekDates[6].getDate()}일
        </span>
        <HelpTooltip text="화살표 버튼으로 이전/다음 주를 탐색하고, '오늘' 버튼으로 현재 주로 돌아옵니다." />
      </div>

      {/* Calendar Grid */}
      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-8 border-b">
            <div className="p-3 text-xs text-muted-foreground border-r" />
            {weekDates.map((d, i) => (
              <div key={i} className={`p-3 text-center border-r last:border-r-0 ${isToday(d) ? 'bg-primary/5' : ''}`}>
                <p className="text-xs text-muted-foreground">{days[(i + 1) % 7]}</p>
                <p className={`text-sm font-semibold mt-0.5 ${isToday(d) ? 'text-primary' : ''}`}>{d.getDate()}</p>
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
                const booking = mockBookings.find((b) => b.date === dateStr && b.startTime <= hour && b.endTime > hour);
                return (
                  <div key={i} className={`border-r last:border-r-0 p-0.5 ${isToday(d) ? 'bg-primary/5' : ''}`}>
                    {booking && booking.startTime === hour && (
                      <div className={`rounded p-1.5 text-[10px] border ${statusColors[booking.status]}`}>
                        <p className="font-medium truncate">{booking.resourceName}</p>
                        <p className="opacity-70">{booking.user}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Upcoming List */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            예약 목록
            <HelpTooltip text="모든 예약의 상세 목록입니다. 상태(대기/승인/거절/취소)를 한눈에 확인할 수 있습니다." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mockBookings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div className={`p-2 rounded-lg ${statusColors[b.status]}`}>
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{b.resourceName}</p>
                <p className="text-xs text-muted-foreground">{b.date} · {b.startTime}–{b.endTime} · {b.user}</p>
              </div>
              <Badge className={`text-[10px] ${statusColors[b.status]}`}>{statusLabels[b.status]}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
