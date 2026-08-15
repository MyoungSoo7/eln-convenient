import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Lock,
  Unlock,
  FileSignature,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "@/hooks/use-toast";
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  type Notification,
} from "@/api/notifications";

const PAGE_SIZE = 20;

type FilterType = "all" | "unread" | "read";
type TypeFilter = "all" | Notification["type"];

export default function NotificationsPage() {
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [readFilter, setReadFilter] = useState<FilterType>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const typeConfig: Record<Notification["type"], { icon: typeof Bell; label: string }> = {
    NOTE_LOCKED: { icon: Lock, label: t("notification.noteLocked") },
    NOTE_SIGNED: { icon: FileSignature, label: t("notification.noteSigned") },
    NOTE_UNLOCKED: { icon: Unlock, label: t("notification.noteUnlocked") },
    BOOKING_APPROVED: { icon: CalendarCheck, label: t("notification.bookingApproved") },
  };

  // 서버 페이지네이션 (백엔드는 isRead 필터 미지원이므로 클라이언트에서 필터)
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["notifications", page],
    queryFn: async () => {
      const res = await listNotifications(page, PAGE_SIZE);
      if (!res.ok) throw new Error(res.error ?? "Failed to load notifications");
      // 디버깅: 서버가 실제로 반환한 isRead 분포 로그
      // eslint-disable-next-line no-console
      console.log(
        "[NotificationsPage] fetched:",
        res.data.length,
        "items —",
        "read:", res.data.filter((n) => n.isRead).length,
        "unread:", res.data.filter((n) => !n.isRead).length,
      );
      return res.data;
    },
    staleTime: 0, // 항상 stale — 캐시 표시 후 즉시 백그라운드 refetch
    refetchOnMount: "always", // mount 시 무조건 refetch (캐시 있어도)
    refetchOnWindowFocus: true,
  });

  const notifications = data ?? [];

  // 클라이언트 필터링
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (readFilter === "unread" && n.isRead) return false;
      if (readFilter === "read" && !n.isRead) return false;
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      return true;
    });
  }, [notifications, readFilter, typeFilter]);

  /** 헤더 종 배지 카운트 감소 (optimistic) */
  const decrementUnreadBadge = useCallback(() => {
    queryClient.setQueryData<{ count: number }>(["notifications-unread-count"], (old) => ({
      count: Math.max(0, (old?.count ?? 0) - 1),
    }));
  }, [queryClient]);

  /** 헤더 종 배지 카운트 증가 (롤백용) */
  const incrementUnreadBadge = useCallback(() => {
    queryClient.setQueryData<{ count: number }>(["notifications-unread-count"], (old) => ({
      count: (old?.count ?? 0) + 1,
    }));
  }, [queryClient]);

  /** 항목 본문 클릭 — 읽음 처리만 (페이지에 머무름, "읽음" 필터로 즉시 이동) */
  const handleItemClick = useCallback(
    async (n: Notification) => {
      if (n.isRead) return; // 이미 읽음이면 아무 것도 안함
      // Optimistic: 현재 캐시의 해당 항목 + 헤더 배지 카운트 즉시 반영
      queryClient.setQueryData<Notification[]>(["notifications", page], (old) =>
        old ? old.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) : old,
      );
      decrementUnreadBadge();
      try {
        await markAsRead(n.id);
      } catch {
        // 롤백
        queryClient.setQueryData<Notification[]>(["notifications", page], (old) =>
          old ? old.map((x) => (x.id === n.id ? { ...x, isRead: false } : x)) : old,
        );
        incrementUnreadBadge();
        toast({
          title: t("error.serverError"),
          variant: "destructive",
        });
      }
    },
    [queryClient, page, t, decrementUnreadBadge, incrementUnreadBadge],
  );

  /** "이동" 버튼 — 읽음 처리 + 관련 페이지로 이동 */
  const handleNavigate = useCallback(
    async (n: Notification, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!n.isRead) {
        queryClient.setQueryData<Notification[]>(["notifications", page], (old) =>
          old ? old.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) : old,
        );
        decrementUnreadBadge();
        try {
          await markAsRead(n.id);
        } catch {
          incrementUnreadBadge();
          // 이동은 진행 (읽음 처리만 실패)
        }
      }
      if (n.entityType === "note") {
        navigate(`/notes/${n.entityId}`);
      } else if (n.entityType === "booking") {
        navigate("/scheduler");
      }
    },
    [navigate, queryClient, page, decrementUnreadBadge, incrementUnreadBadge],
  );

  const handleMarkAllRead = async () => {
    // Optimistic update — 현재 페이지 + 헤더 배지 0으로 즉시 반영
    const previousList = queryClient.getQueryData<Notification[]>(["notifications", page]);
    const previousBadge = queryClient.getQueryData<{ count: number }>([
      "notifications-unread-count",
    ]);
    queryClient.setQueryData<Notification[]>(["notifications", page], (old) =>
      old ? old.map((x) => ({ ...x, isRead: true })) : old,
    );
    queryClient.setQueryData<{ count: number }>(["notifications-unread-count"], { count: 0 });
    try {
      const res = await markAllAsRead();
      if (res.ok) {
        toast({
          title: t("notification.markAllReadDone"),
          description: t("notification.markAllReadDesc", { count: res.data.updated }),
        });
      }
    } catch {
      // 롤백
      if (previousList) {
        queryClient.setQueryData(["notifications", page], previousList);
      }
      if (previousBadge) {
        queryClient.setQueryData(["notifications-unread-count"], previousBadge);
      }
      toast({
        title: t("error.serverError"),
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString(i18n.language === "ko" ? "ko-KR" : "en-US");

  const unreadInPage = notifications.filter((n) => !n.isRead).length;

  // 다음 페이지 존재 여부: 현재 페이지가 가득 찼으면 다음이 있을 가능성
  const hasNextPage = notifications.length === PAGE_SIZE;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6" />
            {t("notification.pageTitle")}
            <HelpTooltip text={t("notification.pageTooltip")} />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("notification.pageSubtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("refresh")
            )}
          </Button>
          {unreadInPage > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <Check className="h-4 w-4 mr-1" />
              {t("notification.markAllRead")}
            </Button>
          )}
        </div>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t("notification.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 읽음 상태 필터 */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t("notification.readStatus")}</p>
            <div className="flex gap-2 flex-wrap">
              {(["all", "unread", "read"] as FilterType[]).map((f) => (
                <Button
                  key={f}
                  variant={readFilter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReadFilter(f)}
                >
                  {t(`notification.filter.${f}`)}
                </Button>
              ))}
            </div>
          </div>
          {/* 타입 필터 */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t("notification.typeStatus")}</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={typeFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setTypeFilter("all")}
              >
                {t("all")}
              </Button>
              {(Object.keys(typeConfig) as Notification["type"][]).map((k) => {
                const Icon = typeConfig[k].icon;
                return (
                  <Button
                    key={k}
                    variant={typeFilter === k ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypeFilter(k)}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {typeConfig[k].label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 알림 목록 */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            {t("notification.listTitle")}
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              ({filtered.length} {t("items")})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">{t("notification.empty")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((n) => {
                const config = typeConfig[n.type];
                const Icon = config?.icon ?? Bell;
                const unread = !n.isRead;
                return (
                  <div
                    key={n.id}
                    className={`relative flex items-start ${
                      unread
                        ? "bg-primary/10 hover:bg-primary/15"
                        : "bg-background hover:bg-muted/40 opacity-70"
                    } transition-colors`}
                  >
                  <button
                    onClick={() => handleItemClick(n)}
                    disabled={!unread}
                    aria-label={`${unread ? t("notification.markAsRead") : t("notification.filter.read")}: ${n.title}`}
                    className={`flex-1 relative text-left pl-5 pr-2 py-3 flex items-start gap-3 ${
                      unread ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    {/* 왼쪽 컬러 스트라이프 — 안 읽음 표시 */}
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-0 bottom-0 w-1 ${
                        unread ? "bg-primary" : "bg-transparent"
                      }`}
                    />

                    {/* 아이콘 — 읽음/안읽음 색 차이 */}
                    <div className="mt-0.5 shrink-0">
                      <Icon
                        className={`h-5 w-5 ${unread ? "text-primary" : "text-muted-foreground/60"}`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`text-sm ${
                            unread ? "font-bold text-foreground" : "font-normal text-muted-foreground line-through decoration-muted-foreground/30"
                          }`}
                        >
                          {n.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${unread ? "" : "opacity-60"}`}
                        >
                          {config?.label}
                        </Badge>
                        {unread ? (
                          <Badge
                            variant="default"
                            className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground"
                          >
                            {t("notification.badge.new")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 gap-0.5 opacity-60"
                          >
                            <Check className="h-2.5 w-2.5" />
                            {t("notification.badge.read")}
                          </Badge>
                        )}
                      </div>
                      <p
                        className={`text-xs leading-relaxed ${
                          unread ? "text-foreground" : "text-muted-foreground/70"
                        }`}
                      >
                        {n.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(n.createdAt)}
                        </p>
                        {n.actorName && (
                          <p className="text-[10px] text-muted-foreground">
                            · {n.actorName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 오른쪽 안 읽음 점 */}
                    {unread && (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 shrink-0 h-2.5 w-2.5 rounded-full bg-primary animate-pulse"
                      />
                    )}
                  </button>
                  {/* 이동 버튼 — 관련 페이지로 이동 (읽음 처리 포함) */}
                  <button
                    type="button"
                    onClick={(e) => handleNavigate(n, e)}
                    aria-label={t("notification.goToSource")}
                    title={t("notification.goToSource")}
                    className="flex-none px-3 py-3 text-muted-foreground hover:text-primary hover:bg-muted/60 border-l border-border/50 flex items-center transition-colors"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t("notification.pageInfo", { page, count: notifications.length })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isFetching}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage || isFetching}
          >
            {t("next")}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
