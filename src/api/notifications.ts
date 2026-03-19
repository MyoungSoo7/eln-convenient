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
  return apiClient.get<{ count: number }>('/notifications/unread-count');
}

export async function listNotifications(
  page = 1,
  limit = 20,
): Promise<ApiResponse<Notification[]>> {
  return apiClient.get<Notification[]>(`/notifications?page=${page}&limit=${limit}`);
}

export async function markAsRead(id: string): Promise<ApiResponse<Notification>> {
  return apiClient.patch<Notification>(`/notifications/${id}/read`);
}

export async function markAllAsRead(): Promise<ApiResponse<{ updated: number }>> {
  return apiClient.patch<{ updated: number }>('/notifications/read-all');
}
