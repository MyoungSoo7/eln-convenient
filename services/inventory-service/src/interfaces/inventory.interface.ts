export interface IInventoryItem {
  id: string;
  name: string;
  type: 'reagent' | 'sample' | 'equipment' | 'consumable' | 'antibody' | 'plasmid' | 'cell_line';
  status: 'available' | 'in_use' | 'depleted' | 'maintenance';
  category?: string;
  location?: string;
  barcode?: string;
  quantity?: number;
  unit?: string;
  metadata: Record<string, unknown>;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
