import { useState, useEffect, useCallback } from "react";
import { Bell, Lock, Unlock, FileSignature, CalendarCheck, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getUnreadCount,
  listNotifications,
  markAsRead,
  markAllAsRead,
  type Notification,
} from "@/api/notifications";

const POLL_INTERVAL = 30_000;

const typeConfig: Record<Notification["type"], { icon: typeof Bell; label: string }> = {
  NOTE_LOCKED:      { icon: Lock,           label: "잠금" },
  NOTE_SIGNED:      { icon: FileSignature,  label: "서명" },
  NOTE_UNLOCKED:    { icon: Unlock,         label: "잠금 해제" },
  BOOKING_APPROVED: { icon: CalendarCheck,  label: "예약 승인" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await getUnreadCount();
      if (res.ok) setUnreadCount(res.data.count);
    } catch {
      // 조용히 실패
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await listNotifications(1, 20);
      if (res.ok) setNotifications(res.data);
    } catch {
      // 조용히 실패
    }
  }, []);

  // Polling for unread count
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch list when dropdown opens
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const handleItemClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await markAsRead(notification.id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
        );
      } catch {
        // 조용히 실패
      }
    }

    setOpen(false);
    if (notification.entityType === "note") {
      navigate(`/notes/${notification.entityId}`);
    } else if (notification.entityType === "booking") {
      navigate("/scheduler");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // 조용히 실패
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">알림</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              모두 읽음
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            알림이 없습니다
          </div>
        ) : (
          notifications.map((n) => {
            const config = typeConfig[n.type];
            const Icon = config?.icon ?? Bell;
            return (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-muted transition-colors ${
                  !n.isRead ? "bg-primary/5" : ""
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed ${!n.isRead ? "font-medium" : "text-muted-foreground"}`}>
                    {n.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {timeAgo(n.createdAt)}
                  </p>
                </div>
                {!n.isRead && (
                  <span className="mt-1.5 shrink-0 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
