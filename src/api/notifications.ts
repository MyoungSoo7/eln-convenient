import apiClient, { type ApiResponse } from './client';

export interface Notification {
  id: string;
  recipientId: string;
  type: 'NOTE_LOCKED' | 'NOTE_SIGNED' | 'NOTE_UNLOCKED' | 'BOOKING_APPROVED';
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  actorId: string;
  actorName: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
}

export async function getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
  // _t 타임스탬프로 브라우저/프록시 캐시 우회
  return apiClient.get<{ count: number }>(`/notifications/unread-count?_t=${Date.now()}`);
}

export async function listNotifications(
  page = 1,
  limit = 20,
): Promise<ApiResponse<Notification[]>> {
  // _t 타임스탬프로 브라우저/프록시 캐시 우회 — 항상 fresh 데이터 보장
  return apiClient.get<Notification[]>(
    `/notifications?page=${page}&limit=${limit}&_t=${Date.now()}`,
  );
}

export async function markAsRead(id: string): Promise<ApiResponse<Notification>> {
  return apiClient.patch<Notification>(`/notifications/${id}/read`);
}

export async function markAllAsRead(): Promise<ApiResponse<{ updated: number }>> {
  return apiClient.patch<{ updated: number }>('/notifications/read-all');
}
