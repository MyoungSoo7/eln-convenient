# Inventory CRUD 완성 설계 스펙

**날짜**: 2026-03-18
**범위**: `src/lib/mockData.ts`, `src/api/inventory.ts`, `src/pages/InventoryPage.tsx`
**서비스**: `services/inventory-service` (백엔드 — 변경 없음, 이미 완성)

---

## 1. 배경 및 문제

현재 인벤토리 메뉴는 프론트엔드와 백엔드 사이에 다음과 같은 불일치가 존재해 CRUD가 정상 동작하지 않는다.

| 영역 | 프론트엔드 (현재) | 백엔드 (실제) |
|------|---------|---------|
| `type` 값 | `dev_equipment`, `deliverable`, `license`, `infra` | `reagent`, `sample`, `equipment`, `consumable`, `antibody`, `plasmid`, `cell_line`, `output`, `license`, `infrastructure`, `other` |
| `status` 값 | `available`, `in_use`, `completed`, `expired`, `archived` | `available`, `in_use`, `depleted`, `expired`, `disposed`, `maintenance` |
| `project` 필드 | `item.project` (직접 필드) | `item.metadata?.project` (JSONB) |
| API 함수 수 | 5개 | 10개 |
| 편집/삭제 UI | 없음 | 백엔드 구현 완료 |

---

## 2. 목표

Option 1 (단일 페이지 개선): 기존 `InventoryPage.tsx`를 확장해 풀 CRUD + 수량 조정 + 알림 기능을 구현한다. 백엔드는 변경하지 않는다.

---

## 3. 데이터 모델 정렬

### 3.1 `InventoryItem` 인터페이스 (백엔드 DTO와 완전 일치)

```typescript
// src/lib/mockData.ts
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
  expiryDate?: string;         // ISO 8601
  expiryWarningDays?: number;  // 기본값 30 (백엔드 default)
  tags: string[];
  metadata?: Record<string, unknown>; // 자유 형태 JSONB; UI에서는 표시만 (JSON.stringify)
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

### 3.2 타입 마이그레이션 정책

- 기존 `dev_equipment`, `deliverable`, `infra` 타입은 즉시 무효화
- `mockInventory` 배열을 새 타입(`reagent`, `equipment` 등)으로 교체
- 백엔드 DB에는 구 타입 데이터가 없으므로(신규 서비스) 데이터 마이그레이션 불필요
- 구 타입 alias 없음 — 프론트엔드는 백엔드 타입을 그대로 사용

---

## 4. API 클라이언트 (`src/api/inventory.ts`)

### 4.1 공통 응답 형태

모든 함수는 `ApiResponse<T>` 반환: `{ ok: true, data: T }` 또는 `{ ok: false, error: string }`.

에러 처리 패턴: 각 함수는 `try/catch`로 감싸되, catch에서 mock 데이터를 반환하는 대신 `{ ok: false, error: e.message || '오류가 발생했습니다.' }` 반환. 네트워크 장애(fetch throw)도 이 패턴으로 통일.

### 4.2 기존 함수 (mock fallback 제거, 시그니처 동일)

```typescript
listItems(params?: {
  type?: string; status?: string; q?: string;
  page?: number; limit?: number;
}) → Promise<ApiResponse<InventoryItem[]>>

getItem(id: string) → Promise<ApiResponse<InventoryItem>>

createItem(data: Partial<InventoryItem>) → Promise<ApiResponse<InventoryItem>>

updateItem(id: string, data: Partial<InventoryItem>) → Promise<ApiResponse<InventoryItem>>

deleteItem(id: string) → Promise<ApiResponse<{ message: string; id: string }>>
```

### 4.3 신규 추가 함수

```typescript
// POST /inventory/items/:id/quantity
// 백엔드 응답: { ok: true, data: InventoryItem, history: {before, after, delta} }
// ApiResponse<T> 대신 전용 타입 사용 (백엔드가 data 외에 history도 top-level로 반환)
adjustQuantity(id: string, data: {
  changeType: 'in' | 'out' | 'adjust';  // 'adjust'는 절대값으로 수량 설정
  quantity: number;   // 양수 필수 (방향은 changeType 결정)
  reason?: string;
}) → Promise<{
  ok: true; data: InventoryItem; history: { before: number; after: number; delta: number };
} | { ok: false; error: string }>

// GET /inventory/items/:id/history
getItemHistory(id: string) → Promise<ApiResponse<InventoryHistory[]>>

// GET /inventory/categories  → { id: string; name: string }[]
getCategories() → Promise<ApiResponse<{ id: string; name: string }[]>>

// GET /inventory/alerts/expiring?days=90  (기본 90일)
getExpiringItems(days?: number) → Promise<ApiResponse<
  (InventoryItem & { daysLeft: number; isExpired: boolean; isWarning: boolean })[]
>>

// GET /inventory/alerts/low-stock
// 백엔드 기준: quantity <= minQuantity (minQuantity가 null이면 제외)
getLowStockItems() → Promise<ApiResponse<InventoryItem[]>>
```

---

## 5. `InventoryPage.tsx` UI 구성

### 5.1 에러 처리 공통 정책

| HTTP 상태 | 처리 |
|-----------|------|
| 200 ok:false | `toast.error(res.error)` |
| 401 | `toast.error('세션이 만료되었습니다. 다시 로그인해주세요.')` |
| 403 | `toast.error('권한이 없습니다.')` |
| 404 | `toast.error('항목을 찾을 수 없습니다. 목록을 새로고침합니다.')` + 목록 재로드 |
| 네트워크 오류 | `toast.error('서버에 연결할 수 없습니다.')` |

버튼 단위 권한 제어(숨김/비활성화)는 이번 스펙 범위 밖.

### 5.2 상단 알림 배너

- 페이지 마운트 시 `getExpiringItems(90)`, `getLowStockItems()` 병렬 호출
- 만료 임박(daysLeft <= expiryWarningDays 또는 isExpired) 아이템 수 > 0 → 주황색 배너
- 재고 부족 아이템 수 > 0 → 빨간색 배너
- 배너 클릭 시 status 필터를 각각 `expired` / `depleted`로 설정
- 알림 조회 실패 시 배너 숨김 (비치명적 오류)

### 5.3 타입 탭

버튼 탭 그룹:

| 탭 레이블 | type 파라미터 |
|----------|-------------|
| 전체 | (없음) |
| 시약 | `reagent` |
| 샘플 | `sample` |
| 장비 | `equipment` |
| 소모품 | `consumable` |
| 항체 | `antibody` |
| 플라스미드 | `plasmid` |
| 세포주 | `cell_line` |
| 기타 | (프론트 필터: `output`, `license`, `infrastructure`, `other` 4개 포함) |

"기타" 탭: API에 `type` 파라미터 없이 전체 조회 후 프론트에서 `['output','license','infrastructure','other'].includes(item.type)` 필터.

### 5.4 검색/필터 바

- 텍스트 검색 Input → 300ms 디바운스 후 `q` 파라미터로 API 재요청
- 상태 Select: 전체 / 사용가능(available) / 사용중(in_use) / 소진(depleted) / 만료(expired) / 폐기(disposed) / 유지보수(maintenance)
- 카테고리 Select: `getCategories()` API 결과로 동적 옵션 로드, 로드 실패 시 Select 비활성화

### 5.5 테이블

| 컬럼 | 내용 |
|------|------|
| 이름 | `name` |
| 유형 | `type` — 한국어 레이블 Badge |
| 상태 | `status` — 색상 Badge |
| 수량 | `quantity unit`; `quantity !== undefined && minQuantity !== undefined && quantity <= minQuantity` 이면 주황색 경고 아이콘 |
| 위치 | `location` |
| 만료일 | `expiryDate`; `daysLeft <= expiryWarningDays` 이면 주황, `isExpired` 이면 빨강 "만료" 표시 |
| 액션 | ↕ 수량 조정 / ✏ 수정 / 🗑 삭제 |

**테이블 상태별 렌더:**
- `loading`: "로딩 중..." 텍스트 (colSpan 전체)
- `error`: "데이터를 불러오지 못했습니다." + 재시도 버튼
- `empty`: "등록된 항목이 없습니다." + 항목 추가 버튼

### 5.6 모달 3종

#### ① AddEditDialog (추가/수정)

| 필드 | 컴포넌트 | 필수 | 비고 |
|------|----------|------|------|
| 이름 | Text Input | ✓ | |
| 유형 | Select | ✓ | 추가 시만 변경 가능 |
| 상태 | Select | 수정 시 | 추가 시 항상 `available` |
| 카테고리 | Select | - | API 로드 |
| 위치 | Text Input | - | |
| 수량 | Number Input | - | 양수 |
| 단위 | Text Input | - | |
| 최소재고 | Number Input | - | 양수 |
| 바코드 | Text Input | - | |
| 만료일 | Date Input | - | |
| 만료경고일수 | Number Input | - | 기본 30 |
| 태그 | Text Input | - | 콤마(,) 구분 → `string[]` 변환 |

저장 성공: `toast.success`, 다이얼로그 닫힘, 목록 새로고침
저장 실패: `toast.error(res.error)`

#### ② AdjustQuantityDialog (수량 조정)

- RadioGroup: 입고(in) / 출고(out) / 절대값 설정(adjust)
- 수량 Number Input (양수 필수, 0 불허)
- 사유 Text Input (선택)
- 미리보기 텍스트: `현재 {quantity}{unit} → 조정 후 {computed}{unit}`
  - in: `quantity + input`
  - out: `quantity - input`
  - adjust: `input`
- 저장 성공: `toast.success('수량이 조정되었습니다.')`, 목록 새로고침
- 저장 실패: `toast.error(res.error)` (재고 부족 등 백엔드 메시지 그대로 표시)

#### ③ DetailDialog (상세+이력)

- 상단: 현재 아이템 정보 그리드 (모든 필드, metadata는 `JSON.stringify(metadata, null, 2)` pre 블록)
- 하단: `getItemHistory(id)` 호출 → 이력 테이블
  - 컬럼: 날짜 / 변경유형 / 전 수량 / 후 수량 / 사유 / 처리자
  - 로딩 중: "이력 로딩 중..."
  - 이력 없음: "변경 이력이 없습니다."
  - 조회 실패: "이력을 불러오지 못했습니다."

---

## 6. 컴포넌트 구조

모든 서브컴포넌트는 `InventoryPage.tsx` 내 인라인 구현. 이유: 세 모달 모두 `InventoryPage` 상태(items, filters, selectedItem)를 공유하며, 별도 파일로 분리 시 prop drilling 또는 전역 상태 관리가 필요해 복잡도가 증가하기 때문.

```
InventoryPage (default export)
├── 상태: items, loading, error
├── 상태: alerts (expiring, lowStock)
├── 상태: filters (type, status, category, q)
├── 상태: modals (addOpen, editItem, adjustItem, detailItem)
├── AlertBanner           (조건부 렌더)
├── TypeTabs + FilterBar
├── InventoryTable        (loading / empty / error / data)
├── AddEditDialog         (open when addOpen || editItem !== null)
├── AdjustQuantityDialog  (open when adjustItem !== null)
└── DetailDialog          (open when detailItem !== null)
```

---

## 7. 구현 파일 목록

| 파일 | 변경 유형 |
|------|---------|
| `src/lib/mockData.ts` | `InventoryItem` 타입 교체, `InventoryHistory` 타입 추가, mock 데이터 업데이트 |
| `src/api/inventory.ts` | 함수 5개 추가, mock fallback 제거 |
| `src/pages/InventoryPage.tsx` | 전면 재작성 |

---

## 8. 미포함 범위

- 카테고리 추가/수정/삭제 UI (admin 전용 API, 별도 스펙)
- 버튼 단위 권한 제어 (JWT 권한 파싱 로직 필요)
- 바코드 스캐너 연동
- CSV 내보내기
- 인벤토리-노트 링크 연동
