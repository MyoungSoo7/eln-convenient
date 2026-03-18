# Inventory CRUD 완성 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프론트엔드 인벤토리 메뉴에서 시약/샘플/장비/자산 CRUD, 수량 조정, 만료·재고 알림이 백엔드 API와 올바르게 연동되도록 완성한다.

**Architecture:** `mockData.ts`의 InventoryItem 타입을 백엔드 DTO와 일치시키고, `api/inventory.ts`에 10개 함수 완비, `InventoryPage.tsx`를 알림 배너 + 타입 탭 + CRUD + 수량 조정 + 이력 조회가 가능하도록 전면 재작성한다.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (Dialog, Table, Badge, Button, Select, Input, Label, RadioGroup, Tabs), sonner (toast), apiClient (src/api/client.ts)

---

## File Map

| 파일 | 변경 유형 | 책임 |
|------|---------|------|
| `src/lib/mockData.ts` | 수정 | InventoryItem·InventoryHistory 타입 정의, mock 데이터 |
| `src/api/inventory.ts` | 전면 재작성 | inventory-service REST 클라이언트 함수 10개 |
| `src/pages/InventoryPage.tsx` | 전면 재작성 | 인벤토리 UI 전체 |

---

## Task 1: mockData.ts — InventoryItem·InventoryHistory 타입 교체

**Files:**
- Modify: `src/lib/mockData.ts`

- [ ] **Step 1: InventoryItem 인터페이스 교체**

`src/lib/mockData.ts`에서 기존 `InventoryItem` 인터페이스(lines 43–55)를 아래로 교체:

```typescript
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
```

- [ ] **Step 2: mockInventory 배열 교체**

기존 `mockInventory` 배열(dev_equipment, deliverable 등 구 타입 사용)을 아래로 교체:

```typescript
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
```

- [ ] **Step 3: TypeScript 컴파일 에러 없는지 확인**

```bash
cd /c/vscode/lab/lab-companion-feature-phase1-backend-infra
npx tsc --noEmit 2>&1 | head -40
```

기존 `InventoryItem` 참조처(InventoryPage.tsx, api/inventory.ts)에서 에러가 발생할 수 있음 — 이후 태스크에서 수정하므로 지금은 에러 목록만 확인.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mockData.ts
git commit -m "refactor: InventoryItem/InventoryHistory 타입 백엔드 DTO에 맞게 교체"
```

---

## Task 2: api/inventory.ts — 전면 재작성

**Files:**
- Modify: `src/api/inventory.ts`

> **참고**: `apiClient`는 401 응답 시 자동으로 `/login`으로 리디렉트하므로 각 함수에서 401 처리 불필요.
> `adjustQuantity`는 백엔드가 `{ok, data, history}` 형태(history가 top-level)로 반환하므로 ApiResponse<T> 대신 커스텀 타입 사용.

- [ ] **Step 1: 파일 전체 교체**

`src/api/inventory.ts`를 아래 내용으로 완전 교체:

```typescript
/**
 * 인벤토리 서비스 API 클라이언트
 * 경로: /api/inventory/*
 */
import apiClient, { type ApiResponse } from './client';
import { type InventoryItem, type InventoryHistory } from '@/lib/mockData';

export type { InventoryItem, InventoryHistory };

export interface AdjustQuantityResult {
  ok: true;
  data: InventoryItem;
  history: { before: number; after: number; delta: number };
}

// ─────────────────────────────────────────────
// 아이템 CRUD
// ─────────────────────────────────────────────

export async function listItems(params?: {
  type?: string;
  status?: string;
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<InventoryItem[]>> {
  try {
    const query: Record<string, string> = {};
    if (params?.type) query.type = params.type;
    if (params?.status) query.status = params.status;
    if (params?.q) query.q = params.q;
    if (params?.category) query.category = params.category;
    if (params?.page) query.page = String(params.page);
    if (params?.limit) query.limit = String(params.limit);
    return await apiClient.get<InventoryItem[]>('/inventory/items', query);
  } catch (e: any) {
    return { ok: false, data: [] as unknown as InventoryItem[], error: e.message || '목록 조회 실패' };
  }
}

export async function getItem(id: string): Promise<ApiResponse<InventoryItem>> {
  try {
    return await apiClient.get<InventoryItem>(`/inventory/items/${id}`);
  } catch (e: any) {
    return { ok: false, data: null as unknown as InventoryItem, error: e.message || '아이템 조회 실패' };
  }
}

export async function createItem(
  data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>
): Promise<ApiResponse<InventoryItem>> {
  try {
    return await apiClient.post<InventoryItem>('/inventory/items', data);
  } catch (e: any) {
    return { ok: false, data: null as unknown as InventoryItem, error: e.message || '아이템 생성 실패' };
  }
}

export async function updateItem(
  id: string,
  data: Partial<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>
): Promise<ApiResponse<InventoryItem>> {
  try {
    return await apiClient.put<InventoryItem>(`/inventory/items/${id}`, data);
  } catch (e: any) {
    return { ok: false, data: null as unknown as InventoryItem, error: e.message || '아이템 수정 실패' };
  }
}

export async function deleteItem(id: string): Promise<ApiResponse<{ message: string; id: string }>> {
  try {
    return await apiClient.delete<{ message: string; id: string }>(`/inventory/items/${id}`);
  } catch (e: any) {
    return { ok: false, data: null as unknown as { message: string; id: string }, error: e.message || '아이템 삭제 실패' };
  }
}

// ─────────────────────────────────────────────
// 수량 조정
// ─────────────────────────────────────────────

export async function adjustQuantity(
  id: string,
  data: { changeType: 'in' | 'out' | 'adjust'; quantity: number; reason?: string }
): Promise<AdjustQuantityResult | { ok: false; error: string }> {
  try {
    // 백엔드 응답: { ok: true, data: InventoryItem, history: {before, after, delta} }
    const res = await apiClient.post<any>(`/inventory/items/${id}/quantity`, data);
    if (!res.ok) return { ok: false, error: (res as any).error || '수량 조정 실패' };
    return res as unknown as AdjustQuantityResult;
  } catch (e: any) {
    return { ok: false, error: e.message || '수량 조정 실패' };
  }
}

export async function getItemHistory(id: string): Promise<ApiResponse<InventoryHistory[]>> {
  try {
    return await apiClient.get<InventoryHistory[]>(`/inventory/items/${id}/history`);
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '이력 조회 실패' };
  }
}

// ─────────────────────────────────────────────
// 카테고리
// ─────────────────────────────────────────────

export async function getCategories(): Promise<ApiResponse<{ id: string; name: string }[]>> {
  try {
    return await apiClient.get<{ id: string; name: string }[]>('/inventory/categories');
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '카테고리 조회 실패' };
  }
}

// ─────────────────────────────────────────────
// 알림
// ─────────────────────────────────────────────

export interface ExpiringItem extends InventoryItem {
  daysLeft: number;
  isExpired: boolean;
  isWarning: boolean;
}

export async function getExpiringItems(days = 90): Promise<ApiResponse<ExpiringItem[]>> {
  try {
    return await apiClient.get<ExpiringItem[]>('/inventory/alerts/expiring', { days: String(days) });
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '만료 임박 조회 실패' };
  }
}

export async function getLowStockItems(): Promise<ApiResponse<InventoryItem[]>> {
  try {
    return await apiClient.get<InventoryItem[]>('/inventory/alerts/low-stock');
  } catch (e: any) {
    return { ok: false, data: [], error: e.message || '재고 부족 조회 실패' };
  }
}
```

- [ ] **Step 2: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | grep -i "inventory"
```

에러 없어야 함. InventoryPage.tsx는 다음 태스크에서 수정.

- [ ] **Step 3: Commit**

```bash
git add src/api/inventory.ts
git commit -m "feat: inventory API 클라이언트 전면 재작성 (10개 함수, mock fallback 제거)"
```

---

## Task 3: InventoryPage.tsx — 전면 재작성

**Files:**
- Modify: `src/pages/InventoryPage.tsx`

> **shadcn/ui 컴포넌트 사용**: Dialog, Table, Badge, Button, Input, Label, Select, RadioGroup. 기존 코드 import 패턴 참고.
> `sonner`의 `toast.success` / `toast.error` 사용.

- [ ] **Step 1: 상수 정의 (타입/상태 레이블·색상)**

파일 최상단에 상수 정의:

```typescript
const TYPE_LABELS: Record<string, string> = {
  reagent: '시약', sample: '샘플', equipment: '장비',
  consumable: '소모품', antibody: '항체', plasmid: '플라스미드',
  cell_line: '세포주', output: '산출물', license: '라이선스',
  infrastructure: '인프라', other: '기타',
};

const STATUS_LABELS: Record<string, string> = {
  available: '사용가능', in_use: '사용중', depleted: '소진',
  expired: '만료', disposed: '폐기', maintenance: '유지보수',
};

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  in_use: 'bg-blue-100 text-blue-800',
  depleted: 'bg-orange-100 text-orange-800',
  expired: 'bg-red-100 text-red-800',
  disposed: 'bg-gray-100 text-gray-600',
  maintenance: 'bg-yellow-100 text-yellow-800',
};

// 기타 탭에 포함되는 타입들
const OTHER_TYPES = ['output', 'license', 'infrastructure', 'other'];

const TAB_DEFS = [
  { key: 'all', label: '전체' },
  { key: 'reagent', label: '시약' },
  { key: 'sample', label: '샘플' },
  { key: 'equipment', label: '장비' },
  { key: 'consumable', label: '소모품' },
  { key: 'antibody', label: '항체' },
  { key: 'plasmid', label: '플라스미드' },
  { key: 'cell_line', label: '세포주' },
  { key: 'other_group', label: '기타' },
] as const;
```

- [ ] **Step 2: AlertBanner 컴포넌트 (인라인)**

```typescript
function AlertBanner({
  expiringCount,
  lowStockCount,
  onExpiringClick,
  onLowStockClick,
}: {
  expiringCount: number;
  lowStockCount: number;
  onExpiringClick: () => void;
  onLowStockClick: () => void;
}) {
  if (expiringCount === 0 && lowStockCount === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {expiringCount > 0 && (
        <button
          onClick={onExpiringClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-50 border border-orange-200 text-orange-700 text-sm hover:bg-orange-100 transition-colors"
        >
          <span className="font-semibold">{expiringCount}건</span> 만료 임박
        </button>
      )}
      {lowStockCount > 0 && (
        <button
          onClick={onLowStockClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm hover:bg-red-100 transition-colors"
        >
          <span className="font-semibold">{lowStockCount}건</span> 재고 부족
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: AddEditDialog 컴포넌트 (인라인)**

```typescript
function AddEditDialog({
  open,
  onOpenChange,
  editItem,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editItem: InventoryItem | null;
  categories: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const isEdit = !!editItem;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '', type: 'reagent' as InventoryItem['type'],
    status: 'available' as InventoryItem['status'],
    category: '', location: '', quantity: '',
    unit: '', minQuantity: '', barcode: '',
    expiryDate: '', expiryWarningDays: '30', tags: '',
  });

  // editItem 변경 시 폼 동기화
  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        type: editItem.type,
        status: editItem.status,
        category: editItem.category ?? '',
        location: editItem.location ?? '',
        quantity: editItem.quantity !== undefined ? String(editItem.quantity) : '',
        unit: editItem.unit ?? '',
        minQuantity: editItem.minQuantity !== undefined ? String(editItem.minQuantity) : '',
        barcode: editItem.barcode ?? '',
        expiryDate: editItem.expiryDate ? editItem.expiryDate.slice(0, 10) : '',
        expiryWarningDays: String(editItem.expiryWarningDays ?? 30),
        tags: (editItem.tags ?? []).join(', '),
      });
    } else {
      setForm({ name: '', type: 'reagent', status: 'available', category: '', location: '',
        quantity: '', unit: '', minQuantity: '', barcode: '', expiryDate: '', expiryWarningDays: '30', tags: '' });
    }
  }, [editItem, open]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('이름을 입력해주세요.'); return; }
    setSubmitting(true);
    const payload: any = {
      name: form.name.trim(),
      type: form.type,
      category: form.category || undefined,
      location: form.location || undefined,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      unit: form.unit || undefined,
      minQuantity: form.minQuantity ? Number(form.minQuantity) : undefined,
      barcode: form.barcode || undefined,
      expiryDate: form.expiryDate || undefined,
      expiryWarningDays: form.expiryWarningDays ? Number(form.expiryWarningDays) : 30,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };
    if (isEdit) payload.status = form.status;

    const res = isEdit
      ? await updateItem(editItem!.id, payload)
      : await createItem(payload);
    setSubmitting(false);

    if (res.ok) {
      toast.success(isEdit ? '아이템이 수정되었습니다.' : '아이템이 추가되었습니다.');
      onOpenChange(false);
      onSaved();
    } else {
      toast.error(res.error || '저장에 실패했습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '아이템 수정' : '아이템 추가'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>이름 <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: Cas9 단백질" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>유형 <span className="text-destructive">*</span></Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as any }))} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div className="space-y-1">
                <Label>상태</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>카테고리</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))} disabled={categories.length === 0}>
                <SelectTrigger><SelectValue placeholder="선택..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">없음</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>위치</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="예: A동 냉장고 #2" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>수량</Label>
              <Input type="number" min="0" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>단위</Label>
              <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="μg, 개..." />
            </div>
            <div className="space-y-1">
              <Label>최소재고</Label>
              <Input type="number" min="0" value={form.minQuantity} onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>바코드</Label>
              <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="REA-2026-001" />
            </div>
            <div className="space-y-1">
              <Label>만료일</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>만료경고일수</Label>
              <Input type="number" min="1" value={form.expiryWarningDays} onChange={(e) => setForm((f) => ({ ...f, expiryWarningDays: e.target.value }))} placeholder="30" />
            </div>
            <div className="space-y-1">
              <Label>태그</Label>
              <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="태그1, 태그2" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? '저장 중...' : isEdit ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: AdjustQuantityDialog 컴포넌트 (인라인)**

```typescript
function AdjustQuantityDialog({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [changeType, setChangeType] = useState<'in' | 'out' | 'adjust'>('in');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) { setChangeType('in'); setQty(''); setReason(''); }
  }, [item]);

  const current = item?.quantity ?? 0;
  const qtyNum = Number(qty) || 0;
  const preview = changeType === 'in' ? current + qtyNum
    : changeType === 'out' ? current - qtyNum
    : qtyNum;

  const handleSave = async () => {
    if (!item) return;
    if (!qty || qtyNum <= 0) { toast.error('수량은 0보다 커야 합니다.'); return; }
    setSubmitting(true);
    const res = await adjustQuantity(item.id, { changeType, quantity: qtyNum, reason: reason || undefined });
    setSubmitting(false);
    if (res.ok) {
      toast.success('수량이 조정되었습니다.');
      onClose();
      onSaved();
    } else {
      toast.error((res as any).error || '수량 조정에 실패했습니다.');
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>수량 조정 — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>변경 유형</Label>
            <div className="flex gap-3">
              {(['in', 'out', 'adjust'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="changeType" value={t} checked={changeType === t}
                    onChange={() => setChangeType(t)} className="accent-primary" />
                  <span className="text-sm">{t === 'in' ? '입고' : t === 'out' ? '출고' : '절대값 설정'}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>수량</Label>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="수량 입력" />
          </div>
          <div className="space-y-1">
            <Label>사유 (선택)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 입력..." />
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            현재 <strong>{current}{item?.unit ?? ''}</strong> → 조정 후{' '}
            <strong className={preview < 0 ? 'text-destructive' : ''}>{preview}{item?.unit ?? ''}</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? '처리 중...' : '적용'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: DetailDialog 컴포넌트 (인라인)**

```typescript
function DetailDialog({
  item,
  onClose,
}: {
  item: InventoryItem | null;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<InventoryHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    if (!item) return;
    setHistoryLoading(true);
    setHistoryError(false);
    getItemHistory(item.id).then((res) => {
      if (res.ok) setHistory(res.data);
      else setHistoryError(true);
    }).finally(() => setHistoryLoading(false));
  }, [item]);

  const CHANGE_TYPE_LABELS: Record<string, string> = {
    in: '입고', out: '출고', adjust: '조정', status_change: '상태변경',
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item?.name}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['유형', TYPE_LABELS[item.type] ?? item.type],
                ['상태', STATUS_LABELS[item.status] ?? item.status],
                ['카테고리', item.category ?? '-'],
                ['위치', item.location ?? '-'],
                ['수량', item.quantity !== undefined ? `${item.quantity} ${item.unit ?? ''}` : '-'],
                ['최소재고', item.minQuantity !== undefined ? `${item.minQuantity} ${item.unit ?? ''}` : '-'],
                ['바코드', item.barcode ?? '-'],
                ['만료일', item.expiryDate ? item.expiryDate.slice(0, 10) : '-'],
                ['만료경고일수', item.expiryWarningDays !== undefined ? `${item.expiryWarningDays}일` : '-'],
                ['태그', (item.tags ?? []).join(', ') || '-'],
                ['등록자', item.createdBy ?? '-'],
                ['등록일', item.createdAt ? item.createdAt.slice(0, 10) : '-'],
              ].map(([label, value]) => (
                <div key={label}><span className="text-muted-foreground">{label}:</span> <span className="font-medium">{value}</span></div>
              ))}
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">메타데이터:</span>
                  <pre className="mt-1 text-xs bg-muted p-2 rounded-md overflow-x-auto">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">변경 이력</p>
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">이력 로딩 중...</p>
              ) : historyError ? (
                <p className="text-sm text-destructive">이력을 불러오지 못했습니다.</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">변경 이력이 없습니다.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>날짜</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>전</TableHead>
                      <TableHead>후</TableHead>
                      <TableHead>사유</TableHead>
                      <TableHead>처리자</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs">{h.createdAt?.slice(0, 16).replace('T', ' ')}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{CHANGE_TYPE_LABELS[h.changeType] ?? h.changeType}</Badge></TableCell>
                        <TableCell className="text-xs">{h.quantityBefore ?? h.statusBefore ?? '-'}</TableCell>
                        <TableCell className="text-xs">{h.quantityAfter ?? h.statusAfter ?? '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{h.reason ?? '-'}</TableCell>
                        <TableCell className="text-xs">{h.performedBy}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: InventoryPage 메인 컴포넌트 작성**

```typescript
export default function InventoryPage() {
  // ── 상태 ──────────────────────────────────────
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [typeTab, setTypeTab] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [expiringCount, setExpiringCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  // 모달
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);

  // ── 검색 디바운스 ──────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // ── 알림 배너 데이터 로드 ──────────────────────
  useEffect(() => {
    Promise.all([getExpiringItems(90), getLowStockItems()]).then(([exp, low]) => {
      if (exp.ok) setExpiringCount(exp.data.length);
      if (low.ok) setLowStockCount(low.data.length);
    });
    getCategories().then((res) => { if (res.ok) setCategories(res.data); });
  }, []);

  // ── 아이템 목록 로드 ──────────────────────────
  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(false);

    // 기타 탭은 API에서 전체 조회 후 프론트 필터
    const apiType = (typeTab === 'all' || typeTab === 'other_group') ? undefined : typeTab;
    const res = await listItems({
      type: apiType,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      q: debouncedQ || undefined,
    });

    if (res.ok) {
      let data = res.data;
      if (typeTab === 'other_group') {
        data = data.filter((i) => OTHER_TYPES.includes(i.type));
      }
      setItems(data);
    } else {
      setError(true);
      toast.error(res.error || '목록을 불러오지 못했습니다.');
    }
    setLoading(false);
  }, [typeTab, statusFilter, categoryFilter, debouncedQ]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── 삭제 핸들러 ───────────────────────────────
  const handleDelete = async (item: InventoryItem) => {
    if (!window.confirm(`'${item.name}'을(를) 삭제하시겠습니까?`)) return;
    const res = await deleteItem(item.id);
    if (res.ok) {
      toast.success('삭제되었습니다.');
      loadItems();
    } else {
      toast.error(res.error || '삭제에 실패했습니다.');
    }
  };

  // ── 만료일 경고 계산 헬퍼 ─────────────────────
  const getExpiryInfo = (item: InventoryItem) => {
    if (!item.expiryDate) return null;
    const daysLeft = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000);
    const warnDays = item.expiryWarningDays ?? 30;
    return { daysLeft, isExpired: daysLeft < 0, isWarning: daysLeft >= 0 && daysLeft <= warnDays };
  };

  // ── 렌더 ──────────────────────────────────────
  return (
    <div className="p-6 space-y-4 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">인벤토리</h1>
          <p className="text-sm text-muted-foreground mt-1">시약 / 샘플 / 장비 / 자산 관리</p>
        </div>
        <Button className="gradient-primary text-primary-foreground gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> 아이템 추가
        </Button>
      </div>

      {/* 알림 배너 */}
      <AlertBanner
        expiringCount={expiringCount}
        lowStockCount={lowStockCount}
        onExpiringClick={() => setStatusFilter('expired')}
        onLowStockClick={() => setStatusFilter('depleted')}
      />

      {/* 타입 탭 */}
      <div className="flex gap-1.5 flex-wrap">
        {TAB_DEFS.map((t) => (
          <Button key={t.key} variant={typeTab === t.key ? 'default' : 'outline'} size="sm"
            className="text-xs" onClick={() => setTypeTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      {/* 검색/필터 */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="이름, 바코드, 위치 검색..."
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="상태 전체" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter} disabled={categories.length === 0}>
          <SelectTrigger className="w-32"><SelectValue placeholder="카테고리" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>수량</TableHead>
                <TableHead>위치</TableHead>
                <TableHead>만료일</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-muted-foreground mb-2">데이터를 불러오지 못했습니다.</p>
                    <Button variant="outline" size="sm" onClick={loadItems}>다시 시도</Button>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-muted-foreground mb-2">등록된 항목이 없습니다.</p>
                    <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>아이템 추가</Button>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const expiry = getExpiryInfo(item);
                  const isLowStock = item.minQuantity !== undefined && item.quantity !== undefined && item.quantity <= item.minQuantity;
                  return (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDetailItem(item)}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[item.type] ?? item.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${STATUS_COLORS[item.status] ?? ''}`}>
                          {STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className={isLowStock ? 'text-orange-600 font-medium' : ''}>
                          {item.quantity !== undefined ? `${item.quantity} ${item.unit ?? ''}` : '-'}
                          {isLowStock && ' ⚠'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.location ?? '-'}</TableCell>
                      <TableCell className="text-sm">
                        {expiry ? (
                          <span className={expiry.isExpired ? 'text-red-600 font-medium' : expiry.isWarning ? 'text-orange-500' : ''}>
                            {expiry.isExpired ? '만료' : `${expiry.daysLeft}일`}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" title="수량 조정"
                            onClick={() => setAdjustItem(item)}>↕</Button>
                          <Button variant="ghost" size="sm" title="수정"
                            onClick={() => setEditItem(item)}>✏</Button>
                          <Button variant="ghost" size="sm" title="삭제" className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(item)}>🗑</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 모달들 */}
      <AddEditDialog
        open={addOpen || !!editItem}
        onOpenChange={(v) => { if (!v) { setAddOpen(false); setEditItem(null); } }}
        editItem={editItem}
        categories={categories}
        onSaved={loadItems}
      />
      <AdjustQuantityDialog
        item={adjustItem}
        onClose={() => setAdjustItem(null)}
        onSaved={loadItems}
      />
      <DetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </div>
  );
}
```

- [ ] **Step 7: 파일 상단 import 작성**

파일 최상단에 아래 import를 작성해 컴포넌트와 API 함수가 모두 연결되도록 한다:

```typescript
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  listItems, createItem, updateItem, deleteItem,
  adjustQuantity, getItemHistory, getCategories,
  getExpiringItems, getLowStockItems,
  type InventoryItem, type InventoryHistory,
} from "@/api/inventory";
```

> `getItem`은 InventoryPage에서 직접 호출하지 않으므로 import에서 제외. DetailDialog는 이미 로드된 `item` prop을 사용한다.

- [ ] **Step 8: TypeScript 컴파일 전체 확인**

```bash
npx tsc --noEmit 2>&1 | head -60
```

에러 없어야 함.

- [ ] **Step 9: 개발 서버에서 동작 확인**

```bash
npm run dev
```

브라우저에서 http://localhost:5173/inventory (또는 해당 경로) 접속 후:
- [ ] 아이템 목록 로드 확인 (API 연결 시) 또는 빈 목록 확인
- [ ] 아이템 추가 다이얼로그 열림 확인
- [ ] 타입 탭 클릭 시 필터 변경 확인
- [ ] 검색 입력 시 debounce 후 API 재요청 확인

- [ ] **Step 10: Commit**

```bash
git add src/pages/InventoryPage.tsx
git commit -m "feat: InventoryPage 전면 재작성 (CRUD, 수량조정, 알림배너, 이력조회)"
```

---

## Task 4: inventory-service Docker 재시작

**Files:** 없음 (Docker 명령)

> 프론트엔드와 실제 백엔드 API 연동을 확인하기 위해 inventory-service 컨테이너를 재시작한다.

- [ ] **Step 1: inventory-service 재시작**

```bash
cd /c/vscode/lab/lab-companion-feature-phase1-backend-infra
docker compose restart inventory-service
```

- [ ] **Step 2: 헬스 확인**

```bash
docker compose logs inventory-service --tail=30
```

"Listening on port 8004" 또는 유사한 준비 완료 메시지 확인.

- [ ] **Step 3: API 엔드포인트 간단 테스트**

```bash
curl -s http://localhost:8004/api/inventory/items | head -100
# 또는 인증이 필요한 경우:
# curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:8000/api/inventory/items
```

`{"ok":true,"data":[...]}` 형태의 응답 확인.

---

## Task 5: 최종 통합 확인 및 마무리 커밋

- [ ] **Step 1: 전체 빌드 확인**

```bash
npm run build 2>&1 | tail -20
```

에러 없이 빌드 완료.

- [ ] **Step 2: 브라우저 통합 테스트**

로그인 후 인벤토리 메뉴에서:
- [ ] 아이템 추가 → API 저장 → 목록 반영
- [ ] 아이템 수정 → API 업데이트 → 목록 반영
- [ ] 수량 조정(입고/출고/절대값) → API 호출 → 수량 변경 확인
- [ ] 아이템 클릭 → 상세 다이얼로그 → 이력 로드 확인
- [ ] 아이템 삭제 → 확인 후 제거

- [ ] **Step 3: 최종 커밋**

```bash
git add src/lib/mockData.ts src/api/inventory.ts src/pages/InventoryPage.tsx
git commit -m "feat: inventory CRUD 완성 - 프론트엔드 백엔드 완전 연동"
```
