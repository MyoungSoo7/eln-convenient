export type ItemType = 'reagent' | 'sample' | 'equipment' | 'consumable' | 'antibody' | 'plasmid' | 'cell_line' | 'output' | 'license' | 'infrastructure' | 'other';

export const VALID_ITEM_TYPES: ItemType[] = [
  'reagent', 'sample', 'equipment', 'consumable',
  'antibody', 'plasmid', 'cell_line',
  'output', 'license', 'infrastructure', 'other',
];

export type ItemStatus = 'available' | 'in_use' | 'depleted' | 'expired' | 'disposed' | 'maintenance';
export type ChangeType = 'in' | 'out' | 'adjust' | 'status_change';
export type SortField = 'name' | 'createdAt' | 'updatedAt' | 'quantity' | 'expiryDate';
export type SortOrder = 'asc' | 'desc';

export interface CreateItemDto {
  name: string;
  type: ItemType;
  category?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  barcode?: string;
  minQuantity?: number;
  expiryDate?: string;        // ISO 8601
  expiryWarningDays?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateItemDto {
  name?: string;
  type?: ItemType;
  status?: ItemStatus;
  category?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  barcode?: string;
  minQuantity?: number;
  expiryDate?: string | null;
  expiryWarningDays?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AdjustQuantityDto {
  changeType: 'in' | 'out' | 'adjust';
  quantity: number;           // 입출고량 (양수, 방향은 changeType으로 결정)
  reason?: string;
}

export interface CreateCategoryDto {
  name: string;
}
