# N+1 쿼리 문제 해결 설계

**날짜:** 2026-03-18
**참고:** `research/Nplus1.md`
**범위:** 전체 서비스 N+1 패턴 제거

---

## 배경

`research/Nplus1.md` 분석에서 발견된 N+1 문제 7건을 해결한다.
심각도별로 CRITICAL 1건, MODERATE 2건, MINOR 4건이다.

---

## 해결 목록

### 1. 🔴 CRITICAL — file-service ZIP 익스포트 HTTP N+1

**현황:** `zipProcessor.ts`가 노트 ID 루프에서 `getNoteForExport(noteId)`를 한 번씩 호출.
N개 노트 → ELN 서비스 HTTP N회 → DB findUnique N회.

**해결:** ELN 서비스에 `POST /api/notes/batch` 엔드포인트 추가.
zipProcessor는 ID 배열을 한 번에 전송해 노트 전체를 단일 응답으로 받는다.

```
Before: for (noteId of noteIds) await getNoteForExport(noteId)  → N HTTP calls
After:  await getNotesBatch(noteIds)                            → 1 HTTP call
```

---

### 2. 🟠 MODERATE — signature-audit getComplianceStats 4회 HTTP 호출

**현황:** `fetchNoteCount`를 상태별로 4회 호출.
각 호출이 ELN의 `getNotes`를 실행 → findMany + count = 상태당 2 DB 쿼리, 합계 8회.

**해결:** ELN 서비스에 `GET /api/notes/stats` 엔드포인트 추가.
`prisma.note.groupBy`로 단 1 DB 쿼리로 상태별 카운트를 반환한다.
signature-audit의 `fetchNoteStats()` 함수로 1회 호출로 교체.

```
Before: fetchNoteCount×4 → ELN HTTP 4회 → DB 8회
After:  fetchNoteStats()  → ELN HTTP 1회 → DB 1회 (groupBy)
```

---

### 3. 🟠 MODERATE — api-gateway dashboard 중복 HTTP 호출

**현황:** dashboard가 ELN 노트 상태 카운트를 4회 직접 호출하고,
추가로 `compliance/stats`가 내부적으로 ELN을 4회 더 호출 → 합계 ELN HTTP 8회.

**해결:** dashboard의 4회 직접 호출을 `GET /api/notes/stats` 단일 호출로 교체.
`compliance/stats`도 위(#2)에서 이미 단일 호출로 변경되므로 자동 해결.

```
Before: ELN HTTP 4회(dashboard) + 4회(complianceStats 내부) = 8회
After:  ELN HTTP 1회(dashboard) + 1회(complianceStats 내부) = 2회
```

---

### 4. 🟡 MINOR — inventory getItemHistory 이중 쿼리

**현황:** `findUnique`(존재확인) + `findMany`(이력조회) = 2 쿼리.

**해결:** `findUnique({ include: { history: { orderBy, take: 100 } } })`로 단일 쿼리화.
item이 null이면 404, 아니면 `item.history`를 그대로 반환.

```
Before: findUnique + findMany → 2 queries
After:  findUnique with include → 1 query
```

---

### 5. 🟡 MINOR — eln-service getAttachments 이중 쿼리

**현황:** `findNote`(존재확인) + `attachment.findMany` = 2 쿼리.

**해결:** `note.findUnique({ include: { attachments: { orderBy: { createdAt: 'asc' } } } })`로 단일 쿼리화.

```
Before: findNote + findMany → 2 queries
After:  findUnique with include → 1 query
```

---

### 6. 🟡 MINOR — eln-service addAttachment 이중 쿼리

**현황:** `findNote`(존재확인) + `attachment.create` = 2 쿼리.

**해결:** `findNote` 제거. `attachment.create` 실행 후 FK 제약 위반(P2003) 에러를 캐치해 404 응답.
noteId FK가 DB에서 보장되므로 별도 존재확인 불필요.

```
Before: findNote + create → 2 queries
After:  create (P2003 catch → 404) → 1 query
```

---

### 7. 🟡 MINOR — eln-service getTags 전체 테이블 스캔

**현황:** `findMany({ select: { tags: true } })`로 전체 노트 로드 후 JS에서 Set으로 중복 제거.
노트 수 증가 시 메모리·네트워크 부담 급증.

**해결:** PostgreSQL `UNNEST` + `DISTINCT`를 `prisma.$queryRaw`로 실행.
DB 레벨에서 중복 제거 + 정렬 완료.

```sql
SELECT DISTINCT UNNEST(tags) AS tag
FROM "Note"
WHERE type = $1 AND "deletedAt" IS NULL
ORDER BY tag
```

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `eln-service/src/controllers/note.controller.ts` | getAttachments·addAttachment·getTags 수정, stats·batch 핸들러 추가 |
| `eln-service/src/routes/note.routes.ts` | `/stats`, `/batch` 라우트 등록 |
| `signature-audit-service/src/lib/eln.ts` | `fetchNoteStats()` 추가, `fetchNoteCount` 유지(하위호환) |
| `signature-audit-service/src/controllers/signature.controller.ts` | `getComplianceStats` 내부 교체 |
| `api-gateway/src/routes/dashboard.ts` | ELN 4회 호출 → stats 1회 호출 |
| `file-service/src/lib/elnClient.ts` | `getNotesBatch(ids)` 추가 |
| `file-service/src/processors/zipProcessor.ts` | 루프 → 배치 fetch |
| `inventory-service/src/controllers/inventory.controller.ts` | `getItemHistory` include 단일 쿼리화 |

---

## 새 엔드포인트 스펙

### GET /api/notes/stats

**Query params:** `type` (note | protocol, 기본값 note)

**Response:**
```json
{
  "ok": true,
  "data": {
    "draft": 10,
    "in_progress": 5,
    "locked": 2,
    "signed": 8,
    "total": 25
  }
}
```

**구현:** `prisma.note.groupBy({ by: ['status'], where: { type, deletedAt: null }, _count: { _all: true } })`

---

### POST /api/notes/batch

**Body:** `{ "ids": ["uuid1", "uuid2", ...] }`
**제한:** ids 배열 최대 500개 (초과 시 400)

**Response:**
```json
{
  "ok": true,
  "data": [ { ...note }, { ...note } ]
}
```

**구현:** `prisma.note.findMany({ where: { id: { in: ids }, deletedAt: null } })`

---

## 주의사항

- `GET /api/notes/stats`는 내부 서비스 전용이므로 인증 미들웨어는 기존 note 라우트 방식 그대로 적용
- `POST /api/notes/batch`도 내부 호출 전용이므로 x-user-id 헤더 필요
- `fetchNoteCount` 함수는 제거하지 않고 유지 (다른 곳에서 호출될 수 있음)
- zipProcessor의 배치 fetch는 일부 노트 fetch 실패 시 해당 노트를 건너뛰는 기존 동작 유지
