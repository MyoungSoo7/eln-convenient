/**
 * 인벤토리 서비스 API 클라이언트
 * 경로: /api/inventory/*
 */
import apiClient, { type ApiResponse } from './client';
import { type InventoryItem, type InventoryHistory } from '@/lib/mockData';

export type { InventoryItem, InventoryHistory };

export interface AdjustQuantityResult {
  ok: true;
  data: InventoryItem;
  history: { before: number; after: number; delta: number };
}

// ─────────────────────────────────────────────
// 아이템 CRUD
// ─────────────────────────────────────────────

export async function listItems(params?: {
  type?: string;
  status?: string;
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<InventoryItem[]>> {
  try {
    const query: Record<string, string> = {};
    if (params?.type) query.type = params.type;
    if (params?.status) query.status = params.status;
    if (params?.q) query.q = params.q;
    if (params?.category) query.category = params.category;
    if (params?.page) query.page = String(params.page);
    if (params?.limit) query.limit = String(params.limit);
    return await apiClient.get<InventoryItem[]>('/inventory/items', query);
  } catch (e: any) {
    return { ok: false, data: [] as unknown as InventoryItem[], error: e.message || '목록 조회 실패' };
  }
}

export async function getItem(id: string): Promise<ApiResponse<InventoryItem>> {
  try {
    return await apiClient.get<InventoryItem>(`/inventory/items/${id}`);
  } catch (e: any) {
    return { ok: false, data: null as unknown as InventoryItem, error: e.message || '아이템 조회 실패' };
  }
}

export async function createItem(
  data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>
): Promise<ApiResponse<InventoryItem>> {
  try {
    return await apiClient.post<InventoryItem>('/inventory/items', data);
  } catch (e: any) {
    return { ok: false, data: null as unknown as InventoryItem, error: e.message || '아이템 생성 실패' };
  }
}

export async function updateItem(
  id: string,
  data: Partial<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>
): Promise<ApiResponse<InventoryItem>> {
  try {
    return await apiClient.put<InventoryItem>(`/inventory/items/${id}`, data);
  } catch (e: any) {
    return { ok: false, data: null as unknown as InventoryItem, error: e.message || '아이템 수정 실패' };
  }
}

export async function deleteItem(id: string): Promise<ApiResponse<{ message: string; id: string }>> {
  try {
    return await apiClient.delete<{ message: string; id: string }>(`/inventory/items/${id}`);
  } catch (e: any) {
    return { ok: false, data: null as unknown as { message: string; id: string }, error: e.message || '아이템 삭제 실패' };
  }
}

// ─────────────────────────────────────────────
// 수량 조정
// ─────────────────────────────────────────────

export async function adjustQuantity(
  id: string,
  data: { changeType: 'in' | 'out' | 'adjust'; quantity: number; reason?: string }
): Promise<AdjustQuantityResult | { ok: false; error: string }> {
  try {
    // 백엔드 응답: { ok: true, data: InventoryItem, history: {before, after, delta} }
    const res = await apiClient.post<any>(`/inventory/items/${id}/quantity`, data);
    if (!res.ok) return { ok: false, error: (res as any).error || '수량 조정 실패' };
    return res as unknown as AdjustQuantityResult;
  } catch (e: any) {
    return { ok: false, error: e.message || '수량 조정 실패' };
  }
}

export async function getItemHistory(id: string): Promise<ApiResponse<InventoryHistory[]>> {
  try {
    return await apiClient.get<InventoryHistory[]>(`/inventory/items/${id}/history`);
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '이력 조회 실패' };
  }
}

// ─────────────────────────────────────────────
// 카테고리
// ─────────────────────────────────────────────

export async function getCategories(): Promise<ApiResponse<{ id: string; name: string }[]>> {
  try {
    return await apiClient.get<{ id: string; name: string }[]>('/inventory/categories');
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '카테고리 조회 실패' };
  }
}

// ─────────────────────────────────────────────
// 알림
// ─────────────────────────────────────────────

export interface ExpiringItem extends InventoryItem {
  daysLeft: number;
  isExpired: boolean;
  isWarning: boolean;
}

export async function getExpiringItems(days = 90): Promise<ApiResponse<ExpiringItem[]>> {
  try {
    return await apiClient.get<ExpiringItem[]>('/inventory/alerts/expiring', { days: String(days) });
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '만료 임박 조회 실패' };
  }
}

export async function getLowStockItems(): Promise<ApiResponse<InventoryItem[]>> {
  try {
    return await apiClient.get<InventoryItem[]>('/inventory/alerts/low-stock');
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '재고 부족 조회 실패' };
  }
}
