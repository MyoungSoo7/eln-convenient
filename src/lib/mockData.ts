// Mock data for the ELN platform

export interface Note {
  id: string;
  title: string;
  status: 'draft' | 'in_progress' | 'signed' | 'locked';
  author?: string;    // mock 데이터용
  authorId?: string;  // 백엔드 API 응답용
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
  expiryDate?: string;        // ISO 8601
  expiryWarningDays?: number; // 기본 30
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

export const mockNotes: Note[] = [
  {
    id: 'n1', title: 'CRISPR-Cas9 유전자 편집 실험 #24', status: 'in_progress',
    author: '김연구', createdAt: '2026-02-25', updatedAt: '2026-02-27',
    tags: ['CRISPR', '유전자편집', 'HEK293'], project: '유전체 편집 프로젝트',
    content: '## 목적\nCRISPR-Cas9을 이용한 HEK293 세포주 유전자 녹아웃\n\n## 재료\n- Cas9 단백질\n- sgRNA (target: BRCA1)\n- Lipofectamine 3000\n\n## 방법\n1. 세포 배양 (DMEM + 10% FBS)\n2. 트랜스펙션 수행\n3. 48시간 후 분석',
    revisions: [
      { id: 'r1', version: 3, author: '김연구', timestamp: '2026-02-27 14:30', summary: '결과 섹션 추가' },
      { id: 'r2', version: 2, author: '김연구', timestamp: '2026-02-26 09:15', summary: '방법 수정' },
      { id: 'r3', version: 1, author: '김연구', timestamp: '2026-02-25 10:00', summary: '초안 작성' },
    ],
    linkedItems: [
      { id: 'i1', type: 'reagent', name: 'Cas9 단백질 (NEB)' },
      { id: 'i2', type: 'equipment', name: 'Neon Transfection System' },
      { id: 'i3', type: 'sample', name: 'HEK293 세포주' },
    ],
  },
  {
    id: 'n2', title: 'Western Blot - p53 발현 분석', status: 'signed',
    author: '박분석', createdAt: '2026-02-20', updatedAt: '2026-02-22',
    tags: ['Western Blot', 'p53', '단백질분석'], project: '암 바이오마커 연구',
  },
  {
    id: 'n3', title: 'RNA 추출 및 qPCR 정량', status: 'draft',
    author: '이실험', createdAt: '2026-02-26', updatedAt: '2026-02-26',
    tags: ['RNA', 'qPCR', '유전자발현'], project: '유전체 편집 프로젝트',
  },
  {
    id: 'n4', title: '세포독성 MTT 분석 (약물 A)', status: 'locked',
    author: '최약리', createdAt: '2026-02-10', updatedAt: '2026-02-15',
    tags: ['MTT', '세포독성', '약물스크리닝'], project: '신약 후보 스크리닝',
  },
  {
    id: 'n5', title: 'Flow Cytometry - 면역세포 표현형 분석', status: 'in_progress',
    author: '김연구', createdAt: '2026-02-24', updatedAt: '2026-02-27',
    tags: ['FACS', '면역', 'T세포'], project: '면역학 연구',
  },
];

export const mockProtocols: Protocol[] = [
  { id: 'p1', title: 'Standard Western Blot Protocol', category: '단백질분석', author: '박분석', version: '3.2', usageCount: 47, tags: ['Western', 'SDS-PAGE'] },
  { id: 'p2', title: 'RNA Extraction (TRIzol)', category: 'RNA', author: '이실험', version: '2.1', usageCount: 89, tags: ['RNA', 'TRIzol'] },
  { id: 'p3', title: 'Cell Culture - HEK293', category: '세포배양', author: '김연구', version: '1.5', usageCount: 156, tags: ['세포배양', 'HEK293'] },
  { id: 'p4', title: 'CRISPR sgRNA 설계 및 클로닝', category: '유전공학', author: '김연구', version: '2.0', usageCount: 32, tags: ['CRISPR', 'sgRNA'] },
  { id: 'p5', title: 'MTT Cell Viability Assay', category: '세포분석', author: '최약리', version: '1.8', usageCount: 61, tags: ['MTT', '세포독성'] },
];

export const mockInventory: InventoryItem[] = [
  {
    id: 'inv1', name: 'Cas9 단백질 (NEB)', type: 'reagent', status: 'available',
    location: 'A동 냉장고 #2', quantity: 50, unit: 'μg', barcode: 'REA-2026-001',
    minQuantity: 10, expiryDate: '2026-09-01', expiryWarningDays: 30,
    tags: ['CRISPR', 'NEB'], category: '단백질',
  },
  {
    id: 'inv2', name: 'HEK293 세포주', type: 'cell_line', status: 'available',
    location: '액체질소 탱크 #1', quantity: 10, unit: '바이알', barcode: 'CEL-2026-001',
    tags: ['세포주', 'HEK293'],
  },
  {
    id: 'inv3', name: 'Neon Transfection System', type: 'equipment', status: 'in_use',
    location: 'B동 실험실 301호', barcode: 'EQP-2026-001',
    tags: ['트랜스펙션', '장비'],
  },
  {
    id: 'inv4', name: 'Lipofectamine 3000', type: 'consumable', status: 'available',
    location: 'A동 냉장고 #1', quantity: 3, unit: '병', barcode: 'CON-2026-001',
    minQuantity: 1, expiryDate: '2026-06-15', expiryWarningDays: 30,
    tags: ['트랜스펙션'],
  },
  {
    id: 'inv5', name: 'Anti-p53 항체 (Santa Cruz)', type: 'antibody', status: 'available',
    location: 'A동 냉동고 #3', quantity: 100, unit: 'μL', barcode: 'ANT-2026-001',
    expiryDate: '2026-04-01', expiryWarningDays: 30,
    tags: ['Western Blot', 'p53'],
  },
];

export const mockBookings: Booking[] = [
  { id: 'b1', resourceName: 'Neon Transfection System', resourceType: 'equipment', user: '김연구', date: '2026-02-27', startTime: '09:00', endTime: '12:00', status: 'approved' },
  { id: 'b2', resourceName: 'BD FACSCanto II', resourceType: 'equipment', user: '이실험', date: '2026-02-27', startTime: '14:00', endTime: '17:00', status: 'pending' },
  { id: 'b3', resourceName: 'A동 세미나실', resourceType: 'room', user: '박분석', date: '2026-02-28', startTime: '10:00', endTime: '11:30', status: 'approved' },
  { id: 'b4', resourceName: 'Confocal Microscope', resourceType: 'equipment', user: '최약리', date: '2026-03-01', startTime: '13:00', endTime: '16:00', status: 'approved' },
  { id: 'b5', resourceName: 'Neon Transfection System', resourceType: 'equipment', user: '이실험', date: '2026-03-02', startTime: '09:00', endTime: '11:00', status: 'pending' },
];

export const mockAuditLog: AuditEntry[] = [
  { id: 'a1', action: '노트 서명', entityType: 'note', entityId: 'n2', user: '박분석', timestamp: '2026-02-22 16:45', details: 'Western Blot - p53 발현 분석 노트에 전자서명 완료', ipAddress: '192.168.1.105' },
  { id: 'a2', action: '노트 수정', entityType: 'note', entityId: 'n1', user: '김연구', timestamp: '2026-02-27 14:30', details: 'CRISPR 실험 노트 결과 섹션 업데이트', ipAddress: '192.168.1.101' },
  { id: 'a3', action: '인벤토리 출고', entityType: 'inventory', entityId: 'inv2', user: '김연구', timestamp: '2026-02-27 09:00', details: 'Lipofectamine 3000 1 kit 출고', ipAddress: '192.168.1.101' },
  { id: 'a4', action: '장비 예약', entityType: 'booking', entityId: 'b1', user: '김연구', timestamp: '2026-02-26 17:00', details: 'Neon Transfection System 예약 생성', ipAddress: '192.168.1.101' },
  { id: 'a5', action: 'PDF 내보내기', entityType: 'note', entityId: 'n4', user: '최약리', timestamp: '2026-02-15 11:30', details: 'MTT 분석 노트 PDF 내보내기', ipAddress: '192.168.1.108' },
  { id: 'a6', action: '노트 잠금', entityType: 'note', entityId: 'n4', user: '최약리', timestamp: '2026-02-15 11:25', details: '세포독성 MTT 분석 노트 잠금 처리', ipAddress: '192.168.1.108' },
];

export const currentUser = {
  id: 'u1',
  name: '김연구',
  email: 'kim@biolab.kr',
  role: 'Researcher',
  org: 'BioLab 연구소',
  team: '유전체연구팀',
  avatar: '',
};
