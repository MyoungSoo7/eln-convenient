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
| `project` 필드 | `item.project` (직접 필드) | `item.metadata.project` (JSONB) |
| API 함수 | 5개 (list, get, create, update, delete) | 10개 (+ adjustQuantity, history, categories, alerts) |
| 편집/삭제 UI | 없음 | 백엔드 구현 완료 |

---

## 2. 목표

Option 1 (단일 페이지 개선): 기존 `InventoryPage.tsx`를 확장해 풀 CRUD + 수량 조정 + 알림 기능을 구현한다. 백엔드는 변경하지 않는다.

---

## 3. 섹션 1 — 타입 및 데이터 모델 정렬

### `src/lib/mockData.ts` — `InventoryItem` 인터페이스 교체

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
  expiryDate?: string;
  expiryWarningDays?: number;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

- `project` 필드 제거, `metadata?.project`로 접근
- `mockInventory` 배열도 새 타입에 맞게 업데이트

---

## 4. 섹션 2 — API 클라이언트 (`src/api/inventory.ts`)

### 추가할 함수

```typescript
adjustQuantity(id: string, data: { changeType: 'in'|'out'|'adjust', quantity: number, reason?: string })
getItemHistory(id: string)
getCategories()
getExpiringItems(days?: number)
getLowStockItems()
```

### mock fallback 정책 변경

- API 실패 시 `console.warn`으로 경고 후 빈 배열/null 반환
- 실제 오류가 숨겨지지 않도록 mock 데이터 자동 반환 제거

---

## 5. 섹션 3 — InventoryPage.tsx UI 구성

### 5.1 상단 알림 배너 (조건부)

- 만료 임박 아이템 수 / 재고 부족 아이템 수를 배지로 표시
- 각각 클릭 시 해당 필터로 테이블 포커스

### 5.2 타입 탭 + 검색/필터 바

- 탭: 전체 / 시약(reagent) / 샘플(sample) / 장비(equipment) / 소모품(consumable) / 항체(antibody) / 플라스미드(plasmid) / 세포주(cell_line) / 기타(other 포함)
- 상태 필터 드롭다운: 전체 / 사용가능 / 사용중 / 소진 / 만료 / 폐기 / 유지보수
- 텍스트 검색: 이름, 바코드, 위치 (API `q` 파라미터 사용)

### 5.3 테이블 컬럼

| 이름 | 유형 | 상태 | 수량 | 위치 | 만료일 | 액션 |
|------|------|------|------|------|--------|------|
| - | Badge | Badge + 경고 아이콘 | quantity + unit | location | expiryDate + 남은일 | 수정·삭제 버튼 |

- 수량이 minQuantity 이하면 수량 셀에 경고 색상
- 만료일이 expiryWarningDays 이내면 만료일 셀에 경고 색상

### 5.4 모달 3종

**① 추가/수정 다이얼로그**
- 필드: 이름(필수), 유형(필수), 상태, 카테고리(Select — API에서 목록 로드), 위치, 수량, 단위, 최소재고, 바코드, 만료일, 만료경고일수, 태그(콤마 입력)

**② 수량 조정 다이얼로그** (테이블 행 클릭 또는 상세에서 버튼)
- 입고(in) / 출고(out) / 절대값 설정(adjust) 라디오
- 수량 입력 + 사유 입력
- 조정 후 현재 재고 미리보기 표시

**③ 상세 보기 다이얼로그**
- 현재 아이템 정보 전체 표시
- 변경 이력 목록 (API `/items/:id/history`)

---

## 6. 컴포넌트 구조

```
InventoryPage.tsx
├── AlertBanner          (인라인 컴포넌트)
├── TypeTabs             (인라인)
├── SearchFilterBar      (인라인)
├── InventoryTable       (인라인)
├── AddEditDialog        (인라인)
├── AdjustQuantityDialog (인라인)
└── DetailDialog         (인라인)
```

모든 컴포넌트는 `InventoryPage.tsx` 내 인라인으로 구현 — 별도 파일 생성 없음.

---

## 7. 구현 범위 (백엔드 변경 없음)

- `src/lib/mockData.ts` — `InventoryItem` 타입 교체, mock 데이터 업데이트
- `src/api/inventory.ts` — 함수 5개 추가, mock fallback 정책 변경
- `src/pages/InventoryPage.tsx` — 전면 재작성

---

## 8. 미포함 범위 (이번 스펙 외)

- 카테고리 관리 UI (admin 전용 API이므로 별도 스펙)
- 바코드 스캐너 연동
- CSV 내보내기
- 인벤토리-노트 링크 연동
