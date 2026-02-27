export interface CreateItemDto {
  name: string;
  type: string;
  category?: string;
  location?: string;
  barcode?: string;
  quantity?: number;
  unit?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface UpdateItemDto {
  name?: string;
  status?: string;
  location?: string;
  quantity?: number;
  metadata?: Record<string, any>;
  tags?: string[];
}
