# Admin RBAC 구현 플랜

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `admin-unlock` 라우트의 역할 게이트를 컨트롤러 내부 수동 검사에서 `requireRole('admin')` 라우트 미들웨어로 이동한다.

**Architecture:** `note.routes.ts`에 `requireRole('admin')` 미들웨어를 추가하고, `note.controller.ts`의 중복 역할 검사 5줄을 제거한다. `verifyAdminPassword` (bcrypt 기반 내부 API 호출)는 이미 구현 완료.

**Tech Stack:** TypeScript, Express, Jest (ts-jest), eln-service

---

## File Map

| 파일 | 작업 |
|------|------|
| `services/eln-service/src/routes/note.routes.ts` | import에 `requireRole` 추가, `admin-unlock` 라우트에 미들웨어 체인 추가 |
| `services/eln-service/src/controllers/note.controller.ts` | lines 399–403 수동 역할 검사 5줄 제거 |
| `services/eln-service/src/__tests__/note.controller.test.ts` | 역할 검사 제거 후 컨트롤러 동작 확인 테스트 추가 |

---

## Task 1: 테스트 작성 — 컨트롤러에서 역할 검사가 없어야 함을 검증

**Files:**
- Modify: `services/eln-service/src/__tests__/note.controller.test.ts`

현재 `adminUnlockNote`는 lines 399–403에서 `x-user-role !== 'admin'`이면 즉시 403을 반환한다. 역할 검사를 미들웨어로 옮긴 후에는 컨트롤러가 역할에 상관없이 다음 단계(비밀번호 검증)로 진입해야 한다.

- [ ] **테스트 파일의 `adminUnlockNote — note_status_history 기록` describe 블록 아래에 새 describe 추가**

```typescript
// services/eln-service/src/__tests__/note.controller.test.ts
// 파일 끝에 추가 (기존 마지막 describe 블록 다음)

describe('adminUnlockNote — 역할 검사가 컨트롤러 밖으로 이동됨', () => {
  beforeEach(() => jest.clearAllMocks());

  test('x-user-role이 admin이 아니어도 컨트롤러는 비밀번호 검증 단계로 진입한다', async () => {
    // 역할 검사가 컨트롤러에 남아있으면 이 테스트는 FAIL (403 즉시 반환)
    // 역할 검사를 미들웨어로 이동하면 PASS (노트 조회 단계로 진입)
    mockNoteDb.findUnique.mockResolvedValue({
      id: 'note-001', status: 'locked', authorId: 'user-001',
    });

    const req = makeReq({
      params: { id: 'note-001' },
      body: { adminPassword: 'pw', reason: '테스트' },
      headers: { 'x-user-id': 'user-001', 'x-user-role': 'researcher' }, // admin 아님
    });
    const { res } = makeRes();

    await adminUnlockNote(req, res);

    // 컨트롤러가 403을 즉시 반환하지 않고 prisma.note.findUnique를 호출했어야 함
    expect(mockNoteDb.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'note-001' } }),
    );
  });
});
```

- [ ] **테스트 실행 — FAIL 확인 (역할 검사가 아직 컨트롤러에 있으므로)**

```bash
cd services/eln-service
npm test -- --testPathPattern="note.controller" --verbose 2>&1 | tail -20
```

Expected: `adminUnlockNote — 역할 검사가 컨트롤러 밖으로 이동됨` 테스트가 FAIL (findUnique 미호출)

---

## Task 2: note.routes.ts — requireRole 미들웨어 추가

**Files:**
- Modify: `services/eln-service/src/routes/note.routes.ts`

- [ ] **line 3의 import 수정 — `requireRole` 추가**

현재:
```typescript
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
```

변경 후:
```typescript
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
```

- [ ] **admin-unlock 라우트에 `requireRole('admin')` 추가**

현재 (line 21):
```typescript
router.post('/notes/:id/admin-unlock',           requirePermission('note:unlock'),  ctrl.adminUnlockNote);
```

변경 후:
```typescript
router.post('/notes/:id/admin-unlock',
  requireRole('admin'),              // 레이어 1: 역할 게이트
  requirePermission('note:unlock'),  // 레이어 2: 권한 게이트
  ctrl.adminUnlockNote,
);
```

---

## Task 3: note.controller.ts — 수동 역할 검사 제거

**Files:**
- Modify: `services/eln-service/src/controllers/note.controller.ts`

- [ ] **lines 399–403 제거**

현재 (제거 대상):
```typescript
  const userRole = req.headers['x-user-role'] as string;
  if (userRole !== 'admin') {
    res.status(403).json({ ok: false, error: '관리자 권한이 필요합니다.' });
    return;
  }
```

변경 후 (`adminUnlockNote` 함수 시작 직후):
```typescript
/** POST /api/notes/:id/admin-unlock */
export async function adminUnlockNote(req: Request, res: Response): Promise<void> {
  try {
    const note = await findNote(req.params.id);
    // ... (기존 코드 유지)
```

> **주의**: 함수 시작의 `try` 블록 위치를 확인하세요. 현재 `try`는 line 405에 있습니다. 5줄 제거 후 `try`가 lines 399–403 자리로 올라옵니다.

---

## Task 4: 테스트 실행 및 커밋

**Files:**
- Run: `services/eln-service`

- [ ] **전체 테스트 실행 — 모두 PASS 확인**

```bash
cd services/eln-service
npm test -- --verbose 2>&1 | tail -30
```

Expected:
```
PASS src/__tests__/note.controller.test.ts
  deleteNote — 상태별 삭제 보호
    ✓ locked 노트를 삭제하면 403을 반환하고 delete를 호출하지 않는다
    ✓ signed 노트를 삭제하면 403을 반환한다
  changeNoteStatus — note_status_history 기록
    ✓ 상태 변경 성공 시 note_status_history에 INSERT한다
    ✓ 허용되지 않은 전환 시 note_status_history에 INSERT하지 않는다
  adminUnlockNote — note_status_history 기록
    ✓ 잠금 해제 성공 시 is_admin_action=true로 note_status_history INSERT한다
  adminUnlockNote — 역할 검사가 컨트롤러 밖으로 이동됨
    ✓ x-user-role이 admin이 아니어도 컨트롤러는 비밀번호 검증 단계로 진입한다
```

- [ ] **TypeScript 컴파일 확인**

```bash
cd services/eln-service
npx tsc --noEmit 2>&1
```

Expected: 에러 없음

- [ ] **커밋**

```bash
git add services/eln-service/src/routes/note.routes.ts \
        services/eln-service/src/controllers/note.controller.ts \
        services/eln-service/src/__tests__/note.controller.test.ts
git commit -m "feat(eln): move admin-unlock role check from controller to route middleware"
```

---

## 검증 포인트

구현 완료 후 다음을 확인:

| 항목 | 확인 방법 |
|------|---------|
| 비관리자 admin-unlock 차단 | `x-user-role: researcher`로 요청 시 미들웨어에서 403 반환 |
| 관리자 admin-unlock 진입 | `x-user-role: admin`으로 요청 시 비밀번호 검증 단계 진입 |
| 컨트롤러 내 역할 검사 없음 | `note.controller.ts` lines 399–403 부재 확인 |
| 기존 테스트 모두 통과 | `npm test` 전체 PASS |
