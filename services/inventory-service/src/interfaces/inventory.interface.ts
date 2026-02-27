/** 인벤토리 아이템 인터페이스 */
export interface IInventoryItem {
  id: string;
  name: string;
  type: 'reagent' | 'sample' | 'equipment' | 'consumable' | 'antibody' | 'plasmid' | 'cell_line';
  status: 'available' | 'in_use' | 'depleted' | 'maintenance';
  category: string;
  location: string;
  barcode?: string;
  quantity?: number;
  unit?: string;
  metadata: Record<string, any>;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 카테고리 인터페이스 */
export interface ICategory {
  id: string;
  name: string;
  parentId?: string;
}
