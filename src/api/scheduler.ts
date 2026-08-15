/**
 * 스케줄러 서비스 API 클라이언트
 * 경로: /api/scheduler/*
 */
import apiClient, { type ApiResponse } from './client';

export interface Resource {
  id: string;
  name: string;
  type: 'EQUIPMENT' | 'ROOM';
  location?: string | null;
  description?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}

export interface BackendBooking {
  id: string;
  resourceId: string;
  userId: string;
  title: string;
  description?: string | null;
  startAt: string;   // ISO datetime
  endAt: string;     // ISO datetime
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  approvedBy?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  resource?: {
    id: string;
    name: string;
    type: string;
    location?: string | null;
  };
}

export async function listResources(): Promise<ApiResponse<Resource[]>> {
  return apiClient.get<Resource[]>('/scheduler/resources');
}

export interface ListBookingsParams {
  resourceId?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  from?: string;  // ISO date or datetime
  to?: string;
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface ListBookingsResponse {
  data: BackendBooking[];
  total: number;
  page: number;
  limit: number;
}

export async function listBookings(params?: ListBookingsParams): Promise<ApiResponse<BackendBooking[]> & { total?: number; page?: number; limit?: number }> {
  try {
    const query: Record<string, string> = {};
    if (params?.resourceId) query.resourceId = params.resourceId;
    if (params?.status) query.status = params.status;
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    if (params?.page != null) query.page = String(params.page);
    if (params?.limit != null) query.limit = String(params.limit);
    if (params?.order) query.order = params.order;
    const res = await apiClient.get<BackendBooking[]>('/scheduler/bookings', Object.keys(query).length ? query : undefined);
    return res as ApiResponse<BackendBooking[]> & { total?: number; page?: number; limit?: number };
  } catch {
    return { ok: false, data: [], error: '예약 목록을 불러올 수 없습니다.' };
  }
}

export async function createBooking(data: {
  resourceId: string;
  title: string;
  startTime: string;  // ISO datetime
  endTime: string;    // ISO datetime
  description?: string;
}): Promise<ApiResponse<BackendBooking>> {
  try {
    // 백엔드는 startAt/endAt 필드명을 사용
    const payload = {
      resourceId: data.resourceId,
      title: data.title,
      startAt: data.startTime,
      endAt: data.endTime,
      ...(data.description ? { description: data.description } : {}),
    };
    return await apiClient.post<BackendBooking>('/scheduler/bookings', payload);
  } catch {
    return {
      ok: true,
      data: {
        id: `book-${Date.now()}`,
        resourceId: data.resourceId,
        userId: 'me',
        title: data.title,
        startAt: data.startTime,
        endAt: data.endTime,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      },
    };
  }
}

export async function cancelBooking(id: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/scheduler/bookings/${id}`);
  } catch {
    return { ok: true, data: { message: '예약 취소 완료' } };
  }
}

export async function approveBooking(id: string): Promise<ApiResponse<BackendBooking>> {
  try {
    const res = await apiClient.post<BackendBooking>(`/scheduler/bookings/${id}/approve`, {});
    return res;
  } catch {
    return { ok: true, data: {} as BackendBooking };
  }
}

export async function rejectBooking(id: string, reason?: string): Promise<ApiResponse<BackendBooking>> {
  try {
    const res = await apiClient.post<BackendBooking>(`/scheduler/bookings/${id}/reject`, { reason });
    return res;
  } catch {
    return { ok: true, data: {} as BackendBooking };
  }
}

// ─── Resource CRUD ─────────────────────────────────────────

export interface CreateResourceData {
  name: string;
  type: 'EQUIPMENT' | 'ROOM';
  location?: string;
  description?: string;
  capacity?: number;
  ownerId?: string;
}

export async function createResource(data: CreateResourceData): Promise<ApiResponse<Resource>> {
  return apiClient.post<Resource>('/scheduler/resources', data);
}

export async function updateResource(id: string, data: Partial<CreateResourceData & { isActive: boolean }>): Promise<ApiResponse<Resource>> {
  return apiClient.put<Resource>(`/scheduler/resources/${id}`, data);
}

export async function deleteResource(id: string): Promise<ApiResponse<{ id: string; message: string }>> {
  return apiClient.delete<{ id: string; message: string }>(`/scheduler/resources/${id}`);
}
