import { useState, useEffect, useCallback } from "react";
import { Bell, Lock, Unlock, FileSignature, CalendarCheck, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/authToken";
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

export function NotificationBell() {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();

  const typeConfig: Record<Notification["type"], { icon: typeof Bell; label: string }> = {
    NOTE_LOCKED:      { icon: Lock,           label: t('notification.noteLocked') },
    NOTE_SIGNED:      { icon: FileSignature,  label: t('notification.noteSigned') },
    NOTE_UNLOCKED:    { icon: Unlock,         label: t('notification.noteUnlocked') },
    BOOKING_APPROVED: { icon: CalendarCheck,  label: t('notification.bookingApproved') },
  };

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t('time.justNow');
    if (mins < 60) return t('time.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('time.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('time.daysAgo', { count: days });
  }
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  // unreadCount를 TanStack Query로 관리 — NotificationsPage와 자동 동기화
  const { data: unreadCountData } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => {
      const res = await getUnreadCount();
      if (!res.ok) throw new Error(res.error ?? "Failed to load unread count");
      return res.data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  const unreadCount = unreadCountData?.count ?? 0;

  const setUnreadCount = useCallback(
    (updater: number | ((c: number) => number)) => {
      queryClient.setQueryData<{ count: number }>(["notifications-unread-count"], (old) => {
        const current = old?.count ?? 0;
        const next = typeof updater === "function" ? updater(current) : updater;
        return { count: Math.max(0, next) };
      });
    },
    [queryClient],
  );

  const fetchUnreadCount = useCallback(async () => {
    // TanStack Query가 자동 refetch — 명시적 invalidate로 트리거
    await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
  }, [queryClient]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await listNotifications(1, 20);
      if (res.ok) setNotifications(res.data);
    } catch {
      // 조용히 실패
    }
  }, []);

  // SSE: 실시간 알림 수신 (자동 재연결 내장) + 폴링 폴백
  useEffect(() => {
    fetchUnreadCount();

    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    let es: EventSource | null = null;
    let sseConnected = false;
    let errorCount = 0;
    const token = getToken();

    function connectSSE() {
      if (!token) return;
      es = new EventSource(`${apiBase}/events/notifications?token=${encodeURIComponent(token)}`);

      es.addEventListener('notification', (event) => {
        try {
          const data = JSON.parse(event.data);
          setUnreadCount((c) => c + 1);
          setNotifications((prev) => [
            { ...data, isRead: false, recipientId: '' } as Notification,
            ...prev,
          ]);
        } catch { /* 무시 */ }
      });

      es.onopen = () => { sseConnected = true; errorCount = 0; };
      es.onerror = () => {
        sseConnected = false;
        errorCount++;
        // 연속 실패 5회 이상이면 SSE 포기 → 폴링으로 전환
        if (errorCount >= 5) { es?.close(); es = null; }
      };
    }

    connectSSE();

    // SSE 실패 시 폴링 폴백 (10초 간격)
    const interval = setInterval(() => {
      if (!sseConnected) fetchUnreadCount();
    }, 10_000);

    return () => {
      clearInterval(interval);
      es?.close();
    };
  }, [fetchUnreadCount]);

  // Fetch list when dropdown opens
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  /** 캐시된 ["notifications", ...] 쿼리 데이터를 직접 변형 */
  const patchNotificationCache = (patcher: (n: Notification) => Notification) => {
    queryClient
      .getQueryCache()
      .findAll({ queryKey: ["notifications"] })
      .forEach((query) => {
        const oldData = query.state.data as Notification[] | undefined;
        if (Array.isArray(oldData)) {
          queryClient.setQueryData(query.queryKey, oldData.map(patcher));
        }
      });
  };

  const handleItemClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await markAsRead(notification.id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
        );
        // NotificationsPage 쿼리 캐시 직접 업데이트 — 즉시 리렌더 유발
        patchNotificationCache((n) => (n.id === notification.id ? { ...n, isRead: true } : n));
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
      // NotificationsPage 쿼리 캐시 전체 읽음 처리 — 즉시 리렌더 유발
      patchNotificationCache((n) => ({ ...n, isRead: true }));
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
          <span className="text-sm font-medium">{t('notification.title')}</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              {t('notification.markAllRead')}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t('notification.empty')}
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
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <button
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              className="w-full px-3 py-2 text-center text-xs text-primary hover:bg-muted transition-colors"
            >
              {t('notification.viewAll')}
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
