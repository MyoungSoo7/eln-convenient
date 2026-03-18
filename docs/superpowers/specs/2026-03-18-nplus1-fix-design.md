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

**응답 키 주의:** 현재 `getComplianceStats`는 `in_progress` 카운트를 응답에서 `pending`으로 노출한다.
`fetchNoteStats()`의 groupBy 결과는 DB enum 값인 `in_progress` 키를 반환한다.
`getComplianceStats` 구현 시 `stats.in_progress`를 응답의 `pending` 키에 매핑해야 한다. 키 이름을 변경하면 api-gateway의 compliance 소비자가 깨진다.

```
Before: fetchNoteCount×4 → ELN HTTP 4회 → DB 8회
After:  fetchNoteStats()  → ELN HTTP 1회 → DB 1회 (groupBy)

// getComplianceStats 응답 (변경 없음):
{ signed, pending /* = in_progress */, locked, draft, totalSignatures }
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

**dashboard 응답 조합 로직 변경:**
기존 dashboard는 `[draft, inProgress, signed, locked]` 배열을 받아 각 원소의 `.total`을 읽는다.
새 엔드포인트는 `{ draft, in_progress, locked, signed, total }` 플랫 객체를 반환하므로 조합 로직도 변경해야 한다.

```typescript
// 변경 후 dashboard.ts — notes 조합 블록
let notes: Record<string, number | null> = { draft: null, in_progress: null, signed: null, locked: null, total: null };
if (noteStats.status === 'fulfilled' && noteStats.value) {
  const s = noteStats.value as { draft: number; in_progress: number; locked: number; signed: number; total: number };
  notes = { draft: s.draft, in_progress: s.in_progress, signed: s.signed, locked: s.locked, total: s.total };
}
```

`safeGet`이 `data` 필드를 unwrap하므로 `noteStats.value`가 바로 stats 객체임에 주의.

---

### 4. 🟡 MINOR — inventory getItemHistory 이중 쿼리

**현황:** `findUnique`(존재확인) + `findMany`(이력조회) = 2 쿼리.

**해결:** `findUnique({ include: { history: { orderBy: { createdAt: 'desc' }, take: 100 } } })`로 단일 쿼리화.
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
스키마상 `Attachment.noteId`만 FK이며 `fileId`는 plain String이므로 P2003은 반드시 noteId 미존재에서만 발생.
catch 구조: `if (err?.code === 'P2003') { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }) }`

```
Before: findNote + create → 2 queries
After:  create (P2003 catch → 404) → 1 query
```

---

### 7. 🟡 MINOR — eln-service getTags 전체 테이블 스캔

**현황:** `findMany({ select: { tags: true } })`로 전체 노트 로드 후 JS에서 Set으로 중복 제거.
노트 수 증가 시 메모리·네트워크 부담 급증.
또한 기존 구현은 `deletedAt` 필터가 없어 소프트 삭제된 노트의 태그도 포함됨.

**해결:** PostgreSQL `UNNEST` + `DISTINCT`를 `prisma.$queryRaw`로 실행.
DB 레벨에서 중복 제거 + 정렬 완료. `deletedAt IS NULL` 필터도 추가하여 소프트 삭제 노트 태그 제외.
**이는 의도적인 동작 변경이다** — 삭제된 노트의 태그가 이제 제외된다. 코드 주석으로도 명시.

```sql
SELECT DISTINCT UNNEST(tags) AS tag
FROM "Note"
WHERE type = $1::text AND "deletedAt" IS NULL
ORDER BY tag
```

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `eln-service/src/controllers/note.controller.ts` | getAttachments·addAttachment·getTags 수정, stats·batch 핸들러 추가 |
| `eln-service/src/routes/note.routes.ts` | `/notes/stats`, `/notes/batch` 라우트를 `/notes/:id` **앞에** 등록 (순서 필수) |
| `signature-audit-service/src/lib/eln.ts` | `fetchNoteStats()` 추가, `fetchNoteCount` 유지(하위호환) |
| `signature-audit-service/src/controllers/signature.controller.ts` | `getComplianceStats` 내부 교체 (응답 키 `pending` 유지) |
| `api-gateway/src/routes/dashboard.ts` | ELN 4회 호출 → `GET /api/notes/stats` 1회 호출 |
| `file-service/src/lib/elnClient.ts` | `postRequest<T>()` 헬퍼 추가, `getNotesBatch(ids)` 추가 |
| `file-service/src/processors/zipProcessor.ts` | 루프 → 배치 fetch |
| `inventory-service/src/controllers/inventory.controller.ts` | `getItemHistory` include 단일 쿼리화 |

---

## 새 엔드포인트 스펙

### GET /api/notes/stats

**Permission:** `requirePermission('note:read')` (기존 note 읽기 엔드포인트와 동일)

**Query params:** `type` (note | protocol, 기본값 note)
- `type`이 `note | protocol` 이외 값이면 `400 { ok: false, error: 'type은 note 또는 protocol이어야 합니다.' }` 반환

**라우트 등록 위치:** `note.routes.ts`에서 `GET /notes/:id` **앞에** 등록해야 한다.
Express가 `stats`를 `:id` 파라미터로 매칭하는 것을 방지하기 위함.

```typescript
// note.routes.ts — /notes/:id 앞에 삽입
router.get('/notes/stats', requirePermission('note:read'), ctrl.getNoteStats);
```

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
groupBy는 해당 상태의 노트가 없으면 해당 키를 반환하지 않는다.
반드시 결과를 `{ draft: 0, in_progress: 0, locked: 0, signed: 0 }` 기본값과 병합하여
4개 키가 항상 존재하도록 정규화한다. `total`은 4개 값의 합.

---

### POST /api/notes/batch

**Permission:** `requirePermission('note:read')` (읽기 전용이므로 note:read 적용)

**라우트 등록 위치:** `note.routes.ts`에서 `GET /notes/:id` **앞에** 등록해야 한다.

```typescript
// note.routes.ts — /notes/:id 앞에 삽입
router.post('/notes/batch', requirePermission('note:read'), ctrl.getNotesBatch);
```

**Body:** `{ "ids": ["uuid1", "uuid2", ...] }`
- `ids` 필드가 없거나 배열이 아니면 `400 { ok: false, error: 'ids는 문자열 배열이어야 합니다.' }` 반환
- `ids`가 빈 배열(`[]`)이면 `{ ok: true, data: [] }` 반환 (400 아님)
- `ids` 배열 길이가 500 초과이면 `400 { ok: false, error: 'ids는 최대 500개까지 허용됩니다.' }` 반환

**Response:**
```json
{
  "ok": true,
  "data": [ { ...note }, { ...note } ]
}
```

**중요:** 요청한 id 중 존재하지 않거나 소프트 삭제된 노트는 응답 배열에서 **조용히 생략**된다.
호출자가 필요한 경우 응답 배열과 요청 ids를 직접 비교하여 누락을 감지해야 한다.
`zipProcessor.ts`는 이 동작에 의존하여 실패 노트를 건너뛰는 기존 동작을 유지한다.

**인증:** 내부 서비스 전용. `file-service`의 `elnClient.ts`에서 호출 시 다음 헤더 필수:
```
x-user-id: system
x-user-role: admin
x-user-permissions: ["*"]
```
`requireAuth` 미들웨어가 `x-user-id` 부재 시 401을 반환하므로 필수.

**구현:** `prisma.note.findMany({ where: { id: { in: ids }, deletedAt: null } })`

---

## file-service elnClient.ts 변경 상세

기존 `request<T>(path: string)` 헬퍼는 GET 전용이며 body를 지원하지 않는다.
`POST /api/notes/batch` 호출을 위해 **`postRequest<T>(path, body)`** 헬퍼를 추가한다.

```typescript
// 추가할 헬퍼 시그니처
function postRequest<T>(path: string, body: unknown): Promise<T>
```

- method: 'POST'
- Content-Type: 'application/json'
- 헤더에 `x-user-id: system`, `x-user-role: admin`, `x-user-permissions: ["*"]` 포함
- body: `JSON.stringify(body)`로 직렬화하여 전송

`getNotesBatch(ids: string[])` 함수는 이 `postRequest`를 사용한다.

---

## 주의사항

- `GET /api/notes/stats`와 `POST /api/notes/batch`는 `note.routes.ts`에서 `GET /notes/:id`보다 **먼저** 등록해야 한다. 순서가 바뀌면 Express가 `stats`·`batch`를 `:id` 파라미터로 처리한다.
- `fetchNoteCount` 함수는 제거하지 않고 유지 (다른 곳에서 호출될 수 있음)
- `getComplianceStats` 응답의 `pending` 키는 유지한다 (`in_progress` DB 값을 `pending`으로 매핑)
- `getTags`의 `deletedAt IS NULL` 추가는 의도적 동작 변경임을 코드 주석으로도 명시
