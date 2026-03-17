import { ItemType, ItemStatus } from '../dtos/inventory.dto';

export interface IInventoryItem {
  id: string;
  name: string;
  type: ItemType;
  status: ItemStatus;
  category?: string | null;
  location?: string | null;
  barcode?: string | null;
  quantity?: number | null;
  unit?: string | null;
  minQuantity?: number | null;
  expiryDate?: string | null;
  expiryWarningDays: number;
  metadata: Record<string, unknown>;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IInventoryHistory {
  id: string;
  itemId: string;
  changeType: string;
  quantityBefore?: number | null;
  quantityAfter?: number | null;
  quantityDelta?: number | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  reason?: string | null;
  performedBy: string;
  createdAt: string;
}

export interface ICategory {
  id: string;
  name: string;
  createdAt: string;
}
