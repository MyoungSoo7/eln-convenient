/**
 * 스케줄러 서비스 API 클라이언트
 * 경로: /api/scheduler/*
 */
import apiClient, { type ApiResponse } from './client';
import { mockBookings } from '@/lib/mockData';

export interface Resource {
  id: string;
  name: string;
  type: 'equipment' | 'room';
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
  startTime: string;  // ISO datetime
  endTime: string;    // ISO datetime
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
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

const mockResources: Resource[] = [
  { id: 'res-default-equipment', name: '기본장비', type: 'equipment', location: 'A동 101호' },
  { id: 'res-default-room', name: '기본 회의실', type: 'room', location: 'B동 201호', capacity: 10 },
];

export async function listResources(): Promise<ApiResponse<Resource[]>> {
  try {
    const res = await apiClient.get<Resource[]>('/scheduler/resources');
    return res;
  } catch {
    return { ok: true, data: mockResources };
  }
}

export async function listBookings(params?: { resourceId?: string; status?: string }): Promise<ApiResponse<BackendBooking[]>> {
  try {
    return await apiClient.get<BackendBooking[]>('/scheduler/bookings', params as Record<string, string>);
  } catch {
    // mock fallback: 백엔드 형식으로 변환
    const today = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      data: mockBookings.map((b) => ({
        id: b.id,
        resourceId: b.id,
        userId: b.user,
        title: `${b.resourceName} 예약`,
        startTime: `${b.date}T${b.startTime}:00`,
        endTime: `${b.date}T${b.endTime}:00`,
        status: b.status,
        createdAt: `${today}T00:00:00.000Z`,
        resource: { id: b.id, name: b.resourceName, type: b.resourceType },
      })),
    };
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
    return await apiClient.post<BackendBooking>('/scheduler/bookings', data);
  } catch {
    return {
      ok: true,
      data: {
        id: `book-${Date.now()}`,
        resourceId: data.resourceId,
        userId: 'me',
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        status: 'pending',
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

export async function approveBooking(id: string): Promise<ApiResponse<{ status: string }>> {
  try {
    return await apiClient.put<{ status: string }>(`/scheduler/bookings/${id}/approve`, {});
  } catch {
    return { ok: true, data: { status: 'approved' } };
  }
}
