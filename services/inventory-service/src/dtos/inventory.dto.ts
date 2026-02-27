export interface CreateItemDto {
  name: string;
  type: 'reagent' | 'sample' | 'equipment' | 'consumable' | 'other';
  quantity: number;
  unit: string;
  location?: string;
  barcode?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateItemDto {
  name?: string;
  status?: 'available' | 'in_use' | 'depleted' | 'expired' | 'disposed';
  quantity?: number;
  location?: string;
  tags?: string[];
}
