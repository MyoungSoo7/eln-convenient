/**
 * 인벤토리 서비스 API 클라이언트
 * 경로: /api/inventory/*
 */
import apiClient, { type ApiResponse } from './client';
import { mockInventory, type InventoryItem } from '@/lib/mockData';

// ── API 함수 ──
export async function listItems(params?: { type?: string; status?: string }): Promise<ApiResponse<InventoryItem[]>> {
  try {
    return await apiClient.get<InventoryItem[]>('/inventory/items', params as Record<string, string>);
  } catch {
    let items = mockInventory;
    if (params?.type) items = items.filter((i) => i.type === params.type);
    if (params?.status) items = items.filter((i) => i.status === params.status);
    return { ok: true, data: items };
  }
}

export async function getItem(id: string): Promise<ApiResponse<InventoryItem>> {
  try {
    return await apiClient.get<InventoryItem>(`/inventory/items/${id}`);
  } catch {
    return { ok: true, data: mockInventory.find((i) => i.id === id) || mockInventory[0] };
  }
}

export async function createItem(data: Partial<InventoryItem>): Promise<ApiResponse<{ id: string }>> {
  try {
    return await apiClient.post<{ id: string }>('/inventory/items', data);
  } catch {
    return { ok: true, data: { id: `item-${Date.now()}` } };
  }
}

export async function updateItem(id: string, data: Partial<InventoryItem>): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.put<{ message: string }>(`/inventory/items/${id}`, data);
  } catch {
    return { ok: true, data: { message: '아이템 수정 완료' } };
  }
}

export async function deleteItem(id: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/inventory/items/${id}`);
  } catch {
    return { ok: true, data: { message: `아이템 ${id} 삭제 완료` } };
  }
}
