import type { CreateItemDto, ItemFilters, ItemsResponse, InventoryItem } from '../types/inventory';

// dev 환경: vite proxy를 통해 /api → localhost:8000
// 프로덕션: VITE_API_URL 환경변수 사용
const BASE = import.meta.env.VITE_API_URL ?? '';

// 개발 중 DB 없이 테스트할 수 있도록 x-user-id / x-user-permissions 헤더 고정
const DEV_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'x-user-id': 'dev-user',
  'x-user-permissions': JSON.stringify(['*']),
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...DEV_HEADERS, ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

export async function fetchItems(filters: ItemFilters): Promise<ItemsResponse> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  params.set('page', String(filters.page));
  params.set('limit', String(filters.limit));
  params.set('sortBy', filters.sortBy);
  params.set('sortOrder', filters.sortOrder);
  return request<ItemsResponse>(`/api/inventory/items?${params}`);
}

export async function createItem(dto: CreateItemDto): Promise<{ ok: boolean; data: InventoryItem }> {
  return request(`/api/inventory/items`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function deleteItem(id: string): Promise<void> {
  await request(`/api/inventory/items/${id}`, { method: 'DELETE' });
}

export async function fetchCategories(): Promise<{ ok: boolean; data: { id: string; name: string }[] }> {
  return request(`/api/inventory/categories`);
}

export async function fetchAlertCounts(): Promise<{
  expiring: number;
  lowStock: number;
}> {
  const [exp, low] = await Promise.all([
    request<{ ok: boolean; total: number }>('/api/inventory/alerts/expiring'),
    request<{ ok: boolean; total: number }>('/api/inventory/alerts/low-stock'),
  ]);
  return { expiring: exp.total, lowStock: low.total };
}
