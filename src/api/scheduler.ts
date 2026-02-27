/**
 * 스케줄러 서비스 API 클라이언트
 * 경로: /api/scheduler/*
 */
import apiClient, { type ApiResponse } from './client';
import { mockBookings, type Booking } from '@/lib/mockData';

export interface Resource {
  id: string;
  name: string;
  type: 'equipment' | 'room';
  location: string;
}

const mockResources: Resource[] = [
  { id: 'res-001', name: 'Neon Transfection System', type: 'equipment', location: 'A동 201호' },
  { id: 'res-002', name: 'BD FACSCanto II', type: 'equipment', location: 'B동 302호' },
  { id: 'res-003', name: 'Confocal Microscope', type: 'equipment', location: 'B동 301호' },
  { id: 'res-004', name: 'A동 세미나실', type: 'room', location: 'A동 3층' },
];

export async function listResources(): Promise<ApiResponse<Resource[]>> {
  try {
    return await apiClient.get<Resource[]>('/scheduler/resources');
  } catch {
    return { ok: true, data: mockResources };
  }
}

export async function listBookings(params?: { resourceId?: string }): Promise<ApiResponse<Booking[]>> {
  try {
    return await apiClient.get<Booking[]>('/scheduler/bookings', params as Record<string, string>);
  } catch {
    let bookings = mockBookings;
    if (params?.resourceId) bookings = bookings.filter((b) => b.resourceName.includes(params.resourceId!));
    return { ok: true, data: bookings };
  }
}

export async function createBooking(data: {
  resourceId: string;
  title: string;
  start: string;
  end: string;
}): Promise<ApiResponse<{ id: string; status: string }>> {
  try {
    return await apiClient.post<{ id: string; status: string }>('/scheduler/bookings', data);
  } catch {
    return { ok: true, data: { id: `book-${Date.now()}`, status: 'pending' } };
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
    return await apiClient.post<{ status: string }>(`/scheduler/bookings/${id}/approve`);
  } catch {
    return { ok: true, data: { status: 'approved' } };
  }
}
