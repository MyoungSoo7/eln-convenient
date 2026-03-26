// 프론트엔드 공용 타입 정의

export interface Note {
  id: string;
  title: string;
  status: 'draft' | 'in_progress' | 'signed' | 'locked';
  author?: string;
  authorId?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  project?: string;
  content?: string;
  templateId?: string;
  revisions?: Revision[];
  linkedItems?: LinkedItem[];
}

export interface Revision {
  id: string;
  version: number;
  author: string;
  timestamp: string;
  summary: string;
}

export interface LinkedItem {
  id: string;
  type: 'reagent' | 'sample' | 'equipment';
  name: string;
}

export interface Protocol {
  id: string;
  title: string;
  category: string;
  author: string;
  version: string;
  usageCount: number;
  tags: string[];
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'reagent' | 'sample' | 'equipment' | 'consumable' |
        'antibody' | 'plasmid' | 'cell_line' | 'output' |
        'license' | 'infrastructure' | 'other';
  status: 'available' | 'in_use' | 'depleted' | 'expired' | 'disposed' | 'maintenance';
  category?: string;
  location?: string;
  barcode?: string;
  quantity?: number;
  unit?: string;
  minQuantity?: number;
  expiryDate?: string;
  expiryWarningDays?: number;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryHistory {
  id: string;
  itemId: string;
  changeType: 'in' | 'out' | 'adjust' | 'status_change';
  quantityBefore?: number;
  quantityAfter?: number;
  quantityDelta?: number;
  statusBefore?: string;
  statusAfter?: string;
  reason?: string;
  performedBy: string;
  createdAt: string;
}

export interface Booking {
  id: string;
  resourceName: string;
  resourceType: 'equipment' | 'room';
  user: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  user: string;
  timestamp: string;
  details: string;
  ipAddress: string;
}

export const currentUser = {
  id: 'user-admin-001',
  name: '관리자',
  email: 'admin@labnote.local',
  role: 'admin',
  org: 'LabNote 연구소',
  team: '',
  avatar: '',
};
