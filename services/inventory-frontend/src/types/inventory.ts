export type ItemType =
  | 'reagent'
  | 'sample'
  | 'equipment'
  | 'consumable'
  | 'antibody'
  | 'plasmid'
  | 'cell_line'
  | 'other';

export type ItemStatus =
  | 'available'
  | 'in_use'
  | 'depleted'
  | 'expired'
  | 'disposed'
  | 'maintenance';

export interface InventoryItem {
  id: string;
  name: string;
  type: ItemType;
  status: ItemStatus;
  category: string | null;
  location: string | null;
  barcode: string | null;
  quantity: number | null;
  unit: string | null;
  minQuantity: number | null;
  expiryDate: string | null;
  expiryWarningDays: number;
  metadata: Record<string, unknown>;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemDto {
  name: string;
  type: ItemType;
  category?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  barcode?: string;
  minQuantity?: number;
  expiryDate?: string;
  expiryWarningDays?: number;
  tags?: string[];
}

export interface ItemsResponse {
  ok: boolean;
  data: InventoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ItemFilters {
  q?: string;
  type?: ItemType | '';
  status?: ItemStatus | '';
  category?: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  reagent: '시약',
  sample: '샘플',
  equipment: '장비',
  consumable: '소모품',
  antibody: '항체',
  plasmid: '플라스미드',
  cell_line: '세포주',
  other: '기타',
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  available: '사용 가능',
  in_use: '사용 중',
  depleted: '소진',
  expired: '만료',
  disposed: '폐기',
  maintenance: '유지보수',
};

export const ITEM_STATUS_COLORS: Record<ItemStatus, string> = {
  available: '#16a34a',
  in_use: '#2563eb',
  depleted: '#dc2626',
  expired: '#9ca3af',
  disposed: '#6b7280',
  maintenance: '#d97706',
};
