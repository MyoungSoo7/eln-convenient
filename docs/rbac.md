# RBAC 분석 및 대시보드 설계 제안서

> 작성일: 2026-03-23
> 대상: LabNote ELN 프로젝트 Phase 2 RBAC 고도화

---

## 1. 현행 RBAC 분석

### 1.1 현재 데이터 구조

```
Organization (조직)
├── Role[] (역할: admin, researcher, reviewer, viewer)
├── Team[] (팀)
│   └── TeamMember[] (다대다 조인)
└── User[] (사용자)
    ├── orgId → Organization
    ├── roleId → Role (1개만)
    └── teamMembers → TeamMember[] (N개 팀 가능)
```

### 1.2 현재 접근 제어 계층

| 계층 | 구현 | 설명 |
|------|------|------|
| **인증** | JWT + API Gateway | `x-user-id`, `x-user-role`, `x-user-permissions`, `x-user-org-id` 주입 |
| **조직 격리** | `getOrgId(headers)` | 모든 쿼리에 orgId 필터 (멀티테넌시) |
| **역할 게이트** | `requireRole()` | admin, reviewer 등 역할 기반 차단 |
| **권한 게이트** | `requirePermission()` | `note:read`, `note:write` 등 세분화 |
| **소유자 확인** | `requireOwnerOrAdmin()` | authorId === userId 또는 admin |

### 1.3 현재 역할별 권한 (4개 역할, 22개 권한)

| 권한 | admin | researcher | reviewer | viewer |
|------|:-----:|:----------:|:--------:|:------:|
| note:read | * | O | O | O |
| note:write | * | O | - | - |
| note:delete | * | - | - | - |
| note:status | * | O | O | - |
| note:sign | * | - | O | - |
| note:unlock | * | - | - | - |
| template:read | * | O | O | O |
| template:write | * | O | - | - |
| template:delete | * | - | - | - |
| inventory:read | * | O | O | O |
| inventory:write | * | O | O | - |
| inventory:delete | * | - | - | - |
| scheduler:read | * | O | O | O |
| scheduler:write | * | O | O | - |
| scheduler:manage | * | - | O | - |
| resource:write | * | - | O | - |
| file:read | * | O | O | O |
| file:upload | * | O | - | - |
| file:delete | * | - | - | - |
| audit:read | * | - | O | - |
| export:pdf | * | O | - | - |
| user:read/write/delete | * | - | - | - |

### 1.4 현행 문제점

#### 문제 1: 팀이 메타데이터로만 존재

```
현재: Organization → User → Note (orgId로만 필터)
문제: 같은 조직 내 모든 사용자가 모든 노트를 볼 수 있음
     팀 A의 연구원이 팀 B의 미공개 실험 데이터를 볼 수 있음
```

- `x-user-team-id` 헤더 없음
- 어떤 서비스도 teamId 기반 쿼리 필터링 없음
- API 응답에서 `teamMembers[0]?.team` — 첫 번째 팀만 반환 (다중 팀 무시)

#### 문제 2: 대시보드가 역할/팀 무관

```
현재 대시보드 캐시: cache:dashboard:{orgId}:{role}
문제: 같은 역할이면 같은 데이터를 봄
     researcher A (화학팀)와 researcher B (생물팀)가 동일 대시보드
```

- `dashboard.ts`에서 내부 호출 시 `x-user-permissions: ['*']` 하드코딩
- viewer도 대시보드 API를 통해 감사로그, compliance 데이터 간접 접근 가능
- 개인 활동 (내 노트, 내 예약)과 조직 전체 통계 구분 없음

#### 문제 3: 역할 확장성 부족

- `RoleName` enum이 4개로 고정 (admin/researcher/reviewer/viewer)
- 실제 연구소에서 필요한 역할:
  - **PI (Principal Investigator)** — 팀 리더, 팀원 노트 검토/서명 권한
  - **Lab Manager** — 장비/시약 관리 특화
  - **Compliance Officer** — 감사/규정준수 전담

#### 문제 4: 팀 리더 개념 없음

- TeamMember에 role/position 필드 없음
- 팀 내 계층 (리더 → 멤버) 표현 불가
- "팀 리더만 팀원 노트를 검토/서명" 같은 비즈니스 규칙 구현 불가

---

## 2. 제안: 3단계 대시보드 아키텍처

### 2.1 대시보드 계층 구조

```
┌─────────────────────────────────────────────────────────┐
│                 조직 대시보드 (Admin 전용)                │
│  "우리 조직 전체 현황이 어떤가?"                          │
│                                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 전체    │ │ 전체    │ │ 전체    │ │ 규정    │       │
│  │ 노트    │ │ 인벤토리│ │ 예약    │ │ 준수율  │       │
│  │ 통계    │ │ 현황    │ │ 현황    │ │ 현황    │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│  ┌──────────────────┐ ┌──────────────────────┐          │
│  │ 팀별 활동 순위   │ │ 전체 감사로그        │          │
│  └──────────────────┘ └──────────────────────┘          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            팀 대시보드 (팀 리더 + Admin)                  │
│  "우리 팀 현황이 어떤가?"                                │
│                                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 팀 노트 │ │ 팀원별  │ │ 팀 예약 │ │ 팀 서명 │       │
│  │ 현황    │ │ 진행률  │ │ 현황    │ │ 대기    │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│  ┌──────────────────┐ ┌──────────────────────┐          │
│  │ 팀원 활동 타임   │ │ 팀 인벤토리 사용     │          │
│  │ 라인             │ │ 현황                 │          │
│  └──────────────────┘ └──────────────────────┘          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              개인 대시보드 (모든 사용자)                   │
│  "내 할 일이 뭐가 있지?"                                 │
│                                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 내 노트 │ │ 서명    │ │ 내 예약 │ │ 알림    │       │
│  │ 현황    │ │ 요청    │ │ 현황    │ │ 카운트  │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│  ┌──────────────────┐ ┌──────────────────────┐          │
│  │ 내 최근 노트     │ │ 오늘/이번주 예약     │          │
│  └──────────────────┘ └──────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 대시보드 접근 권한 매핑

| 대시보드 | 접근 가능 역할 | 데이터 스코프 |
|----------|---------------|--------------|
| **조직** | admin | orgId 전체 |
| **팀** | admin, 팀 리더(PI) | orgId + teamId |
| **개인** | 모든 인증 사용자 | orgId + userId |

### 2.3 API 설계

```
GET /api/dashboard/personal          ← 개인 대시보드 (모든 사용자)
GET /api/dashboard/team/:teamId      ← 팀 대시보드 (팀 리더/admin)
GET /api/dashboard/org               ← 조직 대시보드 (admin 전용)
```

---

## 3. 제안: RBAC 모델 고도화

### 3.1 TeamMember 확장 — 팀 내 역할

```prisma
model TeamMember {
  userId   String
  teamId   String
  teamRole TeamRole @default(member)     // 팀 내 역할 추가
  joinedAt DateTime @default(now())
  user     User     @relation(fields: [userId], references: [id])
  team     Team     @relation(fields: [teamId], references: [id])

  @@id([userId, teamId])
}

enum TeamRole {
  leader     // 팀 리더 (PI) — 팀원 노트 검토/서명
  member     // 일반 팀원
}
```

### 3.2 Note에 teamId 추가 — 팀 스코핑

```prisma
model Note {
  id       String  @id @default(uuid())
  orgId    String
  teamId   String?                        // 소속 팀 (nullable, 개인 노트 가능)
  authorId String
  // ...

  @@index([orgId, teamId, status])        // 팀 기반 쿼리 인덱스
}
```

### 3.3 데이터 가시성 규칙

```
조직 대시보드:
  WHERE orgId = :orgId
  → 조직 전체 데이터

팀 대시보드:
  WHERE orgId = :orgId AND teamId = :teamId
  → 해당 팀 데이터만

개인 대시보드:
  WHERE orgId = :orgId AND authorId = :userId
  → 내 데이터만

노트 목록 (일반 조회):
  - admin: orgId 전체
  - 팀 리더: 내 팀 + 내 개인
  - researcher/reviewer: 내 노트 + 팀 공개 노트
  - viewer: 팀 공개 노트만 (읽기 전용)
```

### 3.4 헤더 확장

```
현재:
  x-user-id, x-user-role, x-user-permissions, x-user-org-id

제안 추가:
  x-user-team-ids: JSON 배열 (소속 팀 ID 목록)
  x-user-team-roles: JSON 객체 (팀별 역할)
    예: {"team-uuid-1":"leader","team-uuid-2":"member"}
```

### 3.5 JWT 페이로드 확장

```typescript
// 현재
{
  sub: userId,
  role: 'researcher',
  permissions: ['note:read', 'note:write', ...],
  orgId: 'org-uuid',
}

// 제안
{
  sub: userId,
  role: 'researcher',
  permissions: ['note:read', 'note:write', ...],
  orgId: 'org-uuid',
  teams: [
    { id: 'team-uuid-1', role: 'leader' },
    { id: 'team-uuid-2', role: 'member' },
  ],
}
```

---

## 4. 제안: 역할 체계 확장

### 4.1 시스템 역할 vs 팀 역할 분리

```
시스템 역할 (Role.name) — 서비스 전체 접근 제어
├── admin          조직 전체 관리
├── researcher     연구 수행
├── reviewer       검토/서명
└── viewer         읽기 전용

팀 역할 (TeamMember.teamRole) — 팀 내 계층
├── leader         팀 리더 (PI) — 팀원 노트 검토 + 팀 대시보드 접근
└── member         일반 팀원
```

### 4.2 권한 해석 우선순위

```
1. 시스템 역할 (admin은 모든 팀 접근 가능)
2. 팀 역할 (leader는 해당 팀 전체 접근)
3. 소유권 (authorId === userId면 자기 리소스 접근)
4. 기본 권한 (permissions 배열에 따름)
```

### 4.3 실전 시나리오

```
시나리오: 화학팀 리더 김연구원이 팀원 노트를 서명하려 함

현재 흐름:
  1. 김연구원의 역할: researcher (note:sign 없음)
  2. 서명 불가 → reviewer 역할이 필요
  3. admin이 김연구원 역할을 reviewer로 변경해야 함
  4. 문제: reviewer가 되면 모든 팀의 노트를 서명 가능

제안 흐름:
  1. 김연구원의 시스템 역할: researcher
  2. 김연구원의 팀 역할: leader (화학팀)
  3. leader는 자기 팀 노트에 한해 note:sign 권한 부여
  4. 다른 팀 노트에는 서명 불가
```

---

## 5. 대시보드별 상세 데이터 스펙

### 5.1 개인 대시보드 (`GET /api/dashboard/personal`)

모든 인증 사용자 접근 가능. 자신의 활동에 초점.

```typescript
{
  ok: true,
  data: {
    // 내 노트 현황
    myNotes: {
      total: number,
      draft: number,
      inProgress: number,
      signed: number,
      locked: number,
    },

    // 내 할 일
    pendingActions: {
      signatureRequests: number,    // 내가 서명해야 할 노트 (reviewer/leader)
      pendingBookings: number,      // 내 승인 대기 예약
      unreadNotifications: number,  // 읽지 않은 알림
    },

    // 내 최근 노트 (최대 5개)
    recentNotes: Array<{
      id: string,
      title: string,
      status: NoteStatus,
      updatedAt: string,
    }>,

    // 내 오늘/이번주 예약
    myBookings: Array<{
      id: string,
      resourceName: string,
      startAt: string,
      endAt: string,
      status: BookingStatus,
    }>,

    // 내 활동 타임라인 (최근 10건)
    myActivity: Array<{
      action: string,
      entityType: string,
      entityId: string,
      createdAt: string,
    }>,
  }
}
```

### 5.2 팀 대시보드 (`GET /api/dashboard/team/:teamId`)

팀 리더(leader) + admin만 접근 가능.

```typescript
{
  ok: true,
  data: {
    team: {
      id: string,
      name: string,
      memberCount: number,
    },

    // 팀 노트 현황
    teamNotes: {
      total: number,
      draft: number,
      inProgress: number,
      signed: number,
      locked: number,
    },

    // 팀원별 진행률
    memberProgress: Array<{
      userId: string,
      userName: string,
      totalNotes: number,
      signedNotes: number,
      inProgressNotes: number,
      lastActivityAt: string,
    }>,

    // 팀 서명 대기 목록
    pendingSignatures: Array<{
      noteId: string,
      noteTitle: string,
      authorName: string,
      requestedAt: string,
    }>,

    // 팀 예약 현황
    teamBookings: Array<{
      id: string,
      resourceName: string,
      userName: string,
      startAt: string,
      status: BookingStatus,
    }>,

    // 팀 인벤토리 사용 현황
    teamInventoryUsage: Array<{
      itemName: string,
      totalUsed: number,
      remainingQuantity: number,
    }>,
  }
}
```

### 5.3 조직 대시보드 (`GET /api/dashboard/org`)

admin 전용.

```typescript
{
  ok: true,
  data: {
    // 전체 현황 (현재 대시보드와 유사)
    overview: {
      totalNotes: number,
      totalUsers: number,
      totalTeams: number,
      activeBookings: number,
      complianceRate: number,     // 서명 완료율 (%)
    },

    // 팀별 활동 순위
    teamRanking: Array<{
      teamId: string,
      teamName: string,
      memberCount: number,
      noteCount: number,
      signedCount: number,
      complianceRate: number,
    }>,

    // 전체 규정 준수 현황
    compliance: {
      signed: number,
      pending: number,
      locked: number,
      draft: number,
      totalSignatures: number,
    },

    // 전체 인벤토리 알림
    alerts: {
      lowStockItems: Array<{ name, quantity, unit }>,
      expiringItems: Array<{ name, expiryDate }>,
    },

    // 전체 감사로그 (최근 10건)
    recentAuditLogs: Array<{
      id: string,
      action: string,
      actorName: string,
      entityType: string,
      createdAt: string,
    }>,

    // 전체 예약 현황
    scheduler: {
      pendingApprovals: number,
      todayBookings: number,
      weeklyBookings: number,
    },
  }
}
```

---

## 6. 접근 제어 미들웨어 확장 제안

### 6.1 팀 접근 검증 미들웨어

```typescript
// 제안: requireTeamAccess(teamIdParam)
// 팀 리더 또는 admin만 팀 대시보드 접근 가능
function requireTeamAccess(teamIdParam: string = 'teamId') {
  return async (request, reply) => {
    const teamId = request.params[teamIdParam];
    const userId = request.headers['x-user-id'];
    const userRole = request.headers['x-user-role'];

    // admin은 모든 팀 접근 가능
    if (userRole === 'admin') return;

    // 팀 멤버십 + leader 역할 확인
    const teamRoles = JSON.parse(request.headers['x-user-team-roles'] || '{}');
    if (teamRoles[teamId] !== 'leader') {
      reply.code(403).send({
        ok: false,
        error: '팀 대시보드는 팀 리더만 접근할 수 있습니다.',
      });
      return;
    }
  };
}
```

### 6.2 노트 가시성 필터 확장

```typescript
// 제안: 팀 기반 노트 쿼리 필터
function buildNoteVisibilityFilter(headers): Prisma.NoteWhereInput {
  const orgId = getOrgId(headers);
  const userId = headers['x-user-id'];
  const userRole = headers['x-user-role'];
  const teamIds = JSON.parse(headers['x-user-team-ids'] || '[]');

  // admin: 조직 전체
  if (userRole === 'admin') {
    return { orgId };
  }

  // 일반 사용자: 내 노트 + 내 팀 노트
  return {
    orgId,
    OR: [
      { authorId: userId },                         // 내가 작성한 노트
      { teamId: { in: teamIds } },                  // 내 팀 노트
      { teamId: null },                             // 팀 미지정 (조직 공개) 노트
    ],
  };
}
```

---

## 7. 캐시 전략 (Redis)

### 7.1 대시보드별 캐시 키

```
개인:  cache:dashboard:personal:{orgId}:{userId}     TTL 2분
팀:    cache:dashboard:team:{orgId}:{teamId}          TTL 3분
조직:  cache:dashboard:org:{orgId}                    TTL 5분
```

### 7.2 캐시 무효화 트리거

| 이벤트 | 무효화 대상 |
|--------|------------|
| 노트 생성/수정/상태변경 | personal:{authorId} + team:{teamId} + org:{orgId} |
| 서명 완료 | personal:{signerId} + team:{teamId} + org:{orgId} |
| 예약 생성/승인/거절 | personal:{userId} + org:{orgId} |
| 인벤토리 변경 | org:{orgId} |
| 사용자/역할 변경 | org:{orgId} |

---

## 8. 마이그레이션 로드맵

### Phase 2-A: 팀 역할 도입 (1~2주)

```
1. TeamMember에 teamRole 필드 추가 (leader/member)
2. JWT에 teams 배열 추가
3. API Gateway에 x-user-team-ids, x-user-team-roles 헤더 주입
4. 프론트엔드 관리 UI에 팀 리더 지정 기능 추가
```

### Phase 2-B: 개인 대시보드 (1주)

```
1. GET /api/dashboard/personal 엔드포인트 구현
2. 내 노트/예약/알림 집계 API
3. 프론트엔드 개인 대시보드 탭 추가
4. 기존 대시보드를 조직 대시보드로 리네이밍
```

### Phase 2-C: 팀 대시보드 (1~2주)

```
1. Note에 teamId 필드 추가 (마이그레이션)
2. GET /api/dashboard/team/:teamId 엔드포인트 구현
3. requireTeamAccess 미들웨어 구현
4. 팀원 진행률, 팀 서명 대기 집계 API
5. 프론트엔드 팀 대시보드 페이지 추가
```

### Phase 2-D: 노트 가시성 고도화 (1주)

```
1. buildNoteVisibilityFilter 구현
2. 노트 목록 API에 팀 기반 필터링 적용
3. 팀 리더의 팀원 노트 서명 권한 로직
4. 프론트엔드 노트 목록에 팀 필터 UI 추가
```

---

## 9. 프론트엔드 대시보드 UI 구조

```
┌─────────────────────────────────────────────────┐
│  [내 대시보드]  [팀 대시보드 ▼]  [조직 대시보드]  │   ← 탭 네비게이션
│                 ├─ 화학팀                        │      (역할에 따라 탭 표시/숨김)
│                 ├─ 생물팀                        │
│                 └─ 장비관리팀                    │
├─────────────────────────────────────────────────┤
│                                                   │
│  (선택된 대시보드 내용)                           │
│                                                   │
└─────────────────────────────────────────────────┘
```

### 탭 표시 규칙

| 역할 | 내 대시보드 | 팀 대시보드 | 조직 대시보드 |
|------|:----------:|:----------:|:------------:|
| admin | O | O (모든 팀) | O |
| researcher (leader) | O | O (리더인 팀만) | - |
| researcher (member) | O | - | - |
| reviewer | O | O (리더인 팀만) | - |
| viewer | O | - | - |

---

## 10. 요약

### 현재 상태

- 조직(orgId) 단위 격리만 존재
- 팀은 메타데이터로만 활용 (접근 제어 미적용)
- 대시보드가 역할/팀/개인 구분 없이 단일

### 제안 핵심

1. **TeamMember.teamRole** 추가로 팀 내 리더/멤버 계층 구현
2. **Note.teamId** 추가로 팀 기반 노트 가시성 제어
3. **3단계 대시보드** (개인 → 팀 → 조직) 구현
4. **JWT + 헤더에 팀 정보** 포함으로 서비스 레벨 팀 접근 제어
5. **팀 리더가 팀원 노트 서명** 가능하도록 권한 체계 확장

### 기대 효과

- 연구소 실제 조직 구조 반영 (PI → 팀원)
- 팀 간 데이터 격리 (화학팀 ↔ 생물팀 실험 데이터 분리)
- 역할별 맞춤 대시보드로 UX 향상
- GLP/GMP 규정 준수 강화 (팀 단위 서명 체인)

---

## 11. 문제별 구체적 해결 설계

> 섹션 1.4에서 식별된 4개 문제에 대한 구체적인 구현 설계

---

### 문제 1 해결: 팀을 접근 제어 단위로 승격

#### AS-IS (현재)

```
[API Gateway]                    [ELN Service]
JWT → x-user-org-id 주입 ───→   WHERE orgId = :orgId
                                 (팀 무관, 조직 전체 노트 노출)
```

#### TO-BE (제안)

```
[API Gateway]                           [ELN Service]
JWT → x-user-org-id 주입       ───→     WHERE orgId = :orgId
    → x-user-team-ids 주입     ───→       AND (authorId = :userId
    → x-user-team-roles 주입              OR teamId IN (:teamIds)
                                          OR teamId IS NULL)
```

#### 변경 파일 및 구현 상세

**1) auth-service/prisma/schema.prisma**

```prisma
// 변경: TeamMember에 teamRole 추가
model TeamMember {
  userId   String
  teamId   String
  teamRole TeamRole @default(member)   // NEW
  joinedAt DateTime @default(now())    // NEW
  user     User     @relation(fields: [userId], references: [id])
  team     Team     @relation(fields: [teamId], references: [id])

  @@id([userId, teamId])
}

enum TeamRole {    // NEW
  leader
  member
}
```

마이그레이션:
```sql
ALTER TABLE "TeamMember" ADD COLUMN "teamRole" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "TeamMember" ADD COLUMN "joinedAt" TIMESTAMP NOT NULL DEFAULT NOW();
CREATE TYPE "TeamRole" AS ENUM ('leader', 'member');
```

**2) eln-service/prisma/schema.prisma**

```prisma
// 변경: Note에 teamId 추가
model Note {
  // 기존 필드 유지...
  teamId   String?     // NEW: 소속 팀 (null = 조직 공개)

  @@index([orgId, teamId, status])           // NEW
  @@index([orgId, teamId, authorId])         // NEW
}
```

마이그레이션:
```sql
ALTER TABLE "Note" ADD COLUMN "teamId" TEXT;
CREATE INDEX "Note_orgId_teamId_status_idx" ON "Note"("orgId", "teamId", "status");
```

기존 데이터 처리 전략:
```sql
-- 기존 노트의 teamId는 NULL (조직 공개)로 유지
-- 작성자의 첫 번째 팀으로 자동 배정하려면:
-- UPDATE "Note" n SET "teamId" = (
--   SELECT tm."teamId" FROM "TeamMember" tm WHERE tm."userId" = n."authorId" LIMIT 1
-- );
-- 단, 이 자동 배정은 선택사항. NULL 유지가 더 안전함.
```

**3) auth-service/controllers/auth.controller.ts — login 함수**

```typescript
// 변경: JWT 페이로드에 teams 배열 추가
export async function login(request, reply) {
  // ...기존 로직...

  // NEW: 팀 멤버십 조회
  const teamMemberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true, teamRole: true },
  });

  const token = jwt.sign({
    sub: user.id,
    email: user.email,
    role: user.role?.name ?? 'viewer',
    permissions: user.role?.permissions ?? [],
    orgId: user.orgId,
    teams: teamMemberships.map(tm => ({   // NEW
      id: tm.teamId,
      role: tm.teamRole,
    })),
  }, JWT_SECRET, { expiresIn: '15m' });

  // ...나머지 동일...
}
```

**4) api-gateway/middlewares/auth.ts — authHook**

```typescript
// 변경: 로컬 JWT 검증 후 팀 헤더 주입 (추가 부분만)

// 기존 헤더 주입 아래에 추가:
const teams: Array<{ id: string; role: string }> = (payload as any).teams ?? [];
const teamIds = teams.map(t => t.id);
const teamRoles: Record<string, string> = {};
teams.forEach(t => { teamRoles[t.id] = t.role; });

(request.headers as any)['x-user-team-ids'] = JSON.stringify(teamIds);
(request.headers as any)['x-user-team-roles'] = JSON.stringify(teamRoles);
```

**5) shared/src/org-scope.ts — 팀 스코프 헬퍼 추가**

```typescript
// NEW: 팀 ID 목록 추출
export function getTeamIds(headers: Record<string, string | string[] | undefined>): string[] {
  const raw = headers['x-user-team-ids'] as string | undefined;
  try { return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

// NEW: 팀별 역할 추출
export function getTeamRoles(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const raw = headers['x-user-team-roles'] as string | undefined;
  try { return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

// NEW: 특정 팀의 리더인지 확인
export function isTeamLeader(headers: Record<string, string | string[] | undefined>, teamId: string): boolean {
  const roles = getTeamRoles(headers);
  return roles[teamId] === 'leader';
}
```

**6) eln-service/controllers/note.controller.ts — getNotes 함수**

```typescript
// 변경: 노트 목록 쿼리에 팀 가시성 필터 적용

export async function getNotes(request, reply) {
  const orgId = getOrgId(request.headers);
  const userId = request.headers['x-user-id'] as string;
  const userRole = request.headers['x-user-role'] as string;
  const teamIds = getTeamIds(request.headers);  // NEW

  // 기본 조건
  const where: any = {
    orgId,
    type: (type as NoteType) || 'note',
    deletedAt: null,
  };

  // NEW: 역할별 가시성 필터
  if (userRole !== 'admin') {
    where.OR = [
      { authorId: userId },              // 내가 작성한 노트
      { teamId: { in: teamIds } },       // 내 팀 노트
      { teamId: null },                  // 조직 공개 노트
    ];
  }

  // 기존 status, tag 필터 유지...
}
```

---

### 문제 2 해결: 3단계 대시보드

#### AS-IS (현재)

```
GET /api/dashboard
  → 조직+역할 기준 캐싱 (cache:dashboard:{orgId}:{role})
  → 모든 사용자에게 동일한 조직 전체 데이터
  → 내부 호출 시 permissions: ['*'] 하드코딩
```

#### TO-BE (제안)

```
GET /api/dashboard/personal       ← userId 기준 (내 데이터만)
GET /api/dashboard/team/:teamId   ← teamId 기준 (팀 데이터)
GET /api/dashboard/org            ← orgId 기준 (조직 전체)
GET /api/dashboard                ← 기존 호환 유지 (개인+조직 합산)
```

#### 변경 파일 및 구현 상세

**1) api-gateway/routes/dashboard.ts — 엔드포인트 분리**

```typescript
export async function registerDashboard(app: FastifyInstance) {

  // ─── 개인 대시보드 ─────────────────────────────
  app.get('/api/dashboard/personal', async (request, reply) => {
    const userId = (request.headers as any)['x-user-id'] as string;
    const userOrgId = (request.headers as any)['x-user-org-id'] as string;

    const cacheKey = `cache:dashboard:personal:${userOrgId}:${userId}`;
    // ... Redis 캐시 확인 (TTL 2분) ...

    // 실제 사용자 헤더를 그대로 전달 (permissions: ['*'] 제거)
    const userHeaders: Record<string, string> = {
      'x-user-id': userId,
      'x-user-role': (request.headers as any)['x-user-role'],
      'x-user-permissions': (request.headers as any)['x-user-permissions'],
      'x-user-org-id': userOrgId,
    };

    const [myNoteStats, myBookings, myNotifications, myRecentNotes] =
      await Promise.allSettled([
        // 내 노트 통계: authorId 필터 (ELN에 ?authorId= 쿼리 추가 필요)
        safeGet(`${ELN_URL}/api/notes/stats?type=note&authorId=${userId}`, userHeaders),
        // 내 예약 (userId 필터)
        safeGet(`${SCH_URL}/api/scheduler/bookings?userId=${userId}&limit=5`, userHeaders),
        // 내 알림 (읽지 않은 것)
        safeGet(`${SIG_URL}/api/notifications/unread-count`, userHeaders),
        // 내 최근 노트
        safeGet(`${ELN_URL}/api/notes?type=note&authorId=${userId}&limit=5`, userHeaders),
      ]);

    // ... 응답 조합 (섹션 5.1 스펙 참조) ...
  });

  // ─── 팀 대시보드 ─────────────────────────────
  app.get('/api/dashboard/team/:teamId', async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    const userRole = (request.headers as any)['x-user-role'] as string;
    const teamRoles = JSON.parse(
      ((request.headers as any)['x-user-team-roles'] as string) || '{}'
    );

    // 접근 제어: admin 또는 해당 팀 리더만
    if (userRole !== 'admin' && teamRoles[teamId] !== 'leader') {
      return reply.code(403).send({
        ok: false,
        error: '팀 대시보드는 팀 리더 또는 관리자만 접근할 수 있습니다.',
      });
    }

    const cacheKey = `cache:dashboard:team:${userOrgId}:${teamId}`;
    // ... Redis 캐시 확인 (TTL 3분) ...

    // 팀 멤버 목록 조회 → 팀원 userId 목록 확보
    // → ELN/Scheduler 서비스에 teamId 또는 authorId IN (:memberIds) 필터
    // ... 응답 조합 (섹션 5.2 스펙 참조) ...
  });

  // ─── 조직 대시보드 ─────────────────────────────
  app.get('/api/dashboard/org', async (request, reply) => {
    const userRole = (request.headers as any)['x-user-role'] as string;

    // admin 전용
    if (userRole !== 'admin') {
      return reply.code(403).send({
        ok: false,
        error: '조직 대시보드는 관리자만 접근할 수 있습니다.',
      });
    }

    // 기존 dashboard.ts 로직을 여기로 이동
    // ... (현재 GET /api/dashboard와 동일한 집계 로직) ...
  });

  // ─── 기존 호환 (기존 /api/dashboard → 개인+조직 합산) ─────
  app.get('/api/dashboard', async (request, reply) => {
    // 기존 로직 유지 (하위 호환)
    // 단, permissions: ['*'] 대신 실제 사용자 권한 전달
  });
}
```

**2) 각 서비스에 필요한 API 변경**

```
ELN Service:
  GET /api/notes/stats?type=note&authorId=:userId     ← authorId 필터 추가
  GET /api/notes/stats?type=note&teamId=:teamId       ← teamId 필터 추가
  GET /api/notes?authorId=:userId                      ← 이미 존재 확인 필요

Scheduler Service:
  GET /api/scheduler/bookings?userId=:userId            ← userId 필터 (기존에 있는지 확인)

Signature-Audit Service:
  GET /api/audit?actorId=:userId                        ← actorId 필터 추가
```

**3) dashboard.ts의 permissions: ['*'] 제거**

```typescript
// AS-IS (보안 문제)
const internalHeaders = {
  'x-user-id': userId || 'system',
  'x-user-role': userRole || 'admin',           // admin 폴백 위험
  'x-user-permissions': JSON.stringify(['*']),   // 와일드카드
  'x-user-org-id': userOrgId || '',
};

// TO-BE (실제 사용자 권한 전달)
const internalHeaders = {
  'x-user-id': userId,
  'x-user-role': userRole,
  'x-user-permissions': request.headers['x-user-permissions'] as string,
  'x-user-org-id': userOrgId,
  'x-user-team-ids': request.headers['x-user-team-ids'] as string ?? '[]',
};
```

---

### 문제 3 해결: 커스텀 역할 지원

#### AS-IS

```prisma
enum RoleName {
  admin        // 4개 고정
  researcher
  reviewer
  viewer
}
```

#### TO-BE (단기)

RoleName enum을 확장하지 않고, **팀 역할(TeamRole)과 시스템 역할(RoleName)의 조합**으로 해결.

```
PI (Principal Investigator) = researcher + teamRole: leader
Lab Manager                 = reviewer (기존 역할 활용)
Compliance Officer          = viewer + audit:read 권한 커스텀 부여
```

#### TO-BE (중기 — 커스텀 역할 완전 지원)

```prisma
// enum 제거, String 자유 입력으로 변경
model Role {
  id          String       @id @default(uuid())
  orgId       String
  name        String                      // enum → String (자유 역할명)
  isSystem    Boolean      @default(false) // 시스템 기본 역할 여부
  permissions String[]
  org         Organization @relation(fields: [orgId], references: [id])
  users       User[]

  @@unique([orgId, name])                  // 조직 내 역할명 unique
}
```

마이그레이션:
```sql
-- 1단계: enum → text 전환
ALTER TABLE "Role" ALTER COLUMN "name" TYPE TEXT;
DROP TYPE "RoleName";

-- 2단계: 기본 역할에 isSystem 마킹
ALTER TABLE "Role" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Role" SET "isSystem" = true WHERE "name" IN ('admin', 'researcher', 'reviewer', 'viewer');

-- 3단계: unique 제약 추가
CREATE UNIQUE INDEX "Role_orgId_name_key" ON "Role"("orgId", "name");
```

**shared/src/permissions.ts 변경:**

```typescript
// RoleName을 const로 유지하되, 커스텀 역할 허용
export const RoleName = {
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
  REVIEWER: 'reviewer',
  VIEWER: 'viewer',
} as const;

// 시스템 기본 역할 확인 헬퍼
export function isSystemRole(name: string): boolean {
  return Object.values(RoleName).includes(name as any);
}
```

**프론트엔드 관리 UI:**
```
역할 관리 페이지 (Admin)
├── 시스템 역할 (삭제 불가, 권한 수정 가능)
│   ├── admin        [편집]
│   ├── researcher   [편집]
│   ├── reviewer     [편집]
│   └── viewer       [편집]
├── 커스텀 역할 (생성/삭제/수정 가능)
│   ├── pi           [편집] [삭제]
│   ├── lab_manager  [편집] [삭제]
│   └── compliance   [편집] [삭제]
└── [+ 새 역할 추가]
```

---

### 문제 4 해결: 팀 리더 서명 권한

#### AS-IS

```
서명 가능 조건:
  1. 시스템 역할: reviewer 또는 admin
  2. 권한: note:sign 보유
  → 모든 조직 내 노트에 서명 가능 (팀 무관)
```

#### TO-BE

```
서명 가능 조건:
  1-A. 시스템 역할: reviewer 또는 admin → 모든 노트 서명 가능 (기존)
  1-B. 팀 역할: leader → 자기 팀 노트에만 서명 가능 (NEW)
  2. 자기 노트에는 서명 불가 (부인방지 원칙)
```

#### 구현 상세

**1) signature-audit-service/controllers/signature.controller.ts — signNote 함수**

```typescript
export async function signNote(request, reply) {
  const signerId = request.headers['x-user-id'] as string;
  const signerRole = request.headers['x-user-role'] as string;
  const teamRoles = getTeamRoles(request.headers);   // NEW
  const { noteId } = request.params as { noteId: string };

  // 노트 정보 조회 (authorId, teamId 포함)
  const note = await fetchNote(noteId);
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);

  // 자기 노트 서명 차단 (부인방지)
  if (note.authorId === signerId) {
    throw new AppError(403, '자신이 작성한 노트에는 서명할 수 없습니다.', ErrorCode.FORBIDDEN);
  }

  // 서명 권한 확인 (확장)
  const hasSystemSignPermission = signerRole === 'admin' || signerRole === 'reviewer';
  const isTeamLeaderOfNote = note.teamId && teamRoles[note.teamId] === 'leader';  // NEW

  if (!hasSystemSignPermission && !isTeamLeaderOfNote) {
    throw new AppError(403,
      '서명 권한이 없습니다. reviewer/admin 역할 또는 해당 팀 리더만 서명 가능합니다.',
      ErrorCode.AUTH_PERMISSION_DENIED
    );
  }

  // ... 기존 서명 로직 계속 ...
}
```

**2) eln-service 노트 상태 전환 — locked 전환도 팀 리더 허용**

```typescript
// note.controller.ts — changeNoteStatus
// AS-IS: locked 전환은 reviewer/admin만
if (newStatus === 'locked') {
  if (userRole !== 'reviewer' && userRole !== 'admin') {
    throw new AppError(403, 'locked 전환은 reviewer/admin만 가능합니다.');
  }
}

// TO-BE: locked 전환은 reviewer/admin + 해당 팀 리더
if (newStatus === 'locked') {
  const isTeamLeader = note.teamId && isTeamLeader(request.headers, note.teamId);
  if (userRole !== 'reviewer' && userRole !== 'admin' && !isTeamLeader) {
    throw new AppError(403, 'locked 전환은 reviewer/admin 또는 팀 리더만 가능합니다.');
  }
}
```

---

## 12. 구현 우선순위 매트릭스

| 순서 | 작업 | 영향 범위 | 난이도 | 하위 호환 | 비고 |
|:----:|------|----------|:------:|:---------:|------|
| 1 | dashboard permissions:['*'] 제거 | api-gateway | 낮음 | O | 보안 문제 즉시 해결 |
| 2 | 개인 대시보드 API 추가 | api-gateway | 중간 | O | 새 엔드포인트, 기존 유지 |
| 3 | TeamMember.teamRole 추가 | auth-service | 낮음 | O | 기본값 member, 기존 무영향 |
| 4 | JWT에 teams 배열 추가 | auth-service | 낮음 | O | 기존 필드 유지, 추가만 |
| 5 | Gateway에 팀 헤더 주입 | api-gateway | 낮음 | O | 새 헤더 추가, 기존 유지 |
| 6 | Note.teamId 추가 | eln-service | 중간 | O | nullable, 기존 노트=NULL |
| 7 | 노트 가시성 필터 적용 | eln-service | 중간 | △ | admin은 무영향, 일반 사용자 범위 축소 |
| 8 | 팀 대시보드 API 추가 | api-gateway | 높음 | O | 새 엔드포인트 |
| 9 | 조직 대시보드 분리 | api-gateway | 중간 | O | 기존 /api/dashboard 유지 |
| 10 | 팀 리더 서명 권한 | signature-audit | 중간 | O | 권한 확장 (제한 아님) |
| 11 | 커스텀 역할 (enum→String) | auth-service | 높음 | △ | DB 마이그레이션 필요 |

> △ = 주의 필요 (기존 코드에서 RoleName enum 참조하는 부분 수정 필요)

---

## 13. 의존성 다이어그램

```
[1] permissions:['*'] 제거
 │
 ├──→ [2] 개인 대시보드 ──→ [8] 팀 대시보드 ──→ [9] 조직 대시보드 분리
 │
[3] TeamMember.teamRole
 │
 ├──→ [4] JWT teams 배열
 │     │
 │     └──→ [5] Gateway 팀 헤더
 │           │
 │           ├──→ [6] Note.teamId ──→ [7] 노트 가시성 필터
 │           │
 │           ├──→ [8] 팀 대시보드
 │           │
 │           └──→ [10] 팀 리더 서명
 │
[11] 커스텀 역할 (독립, 언제든 가능)
```

**최소 실행 단위 (MVP):**
- [1] + [2] = 개인 대시보드 + 보안 수정 (1주)
- [3] + [4] + [5] = 팀 인프라 (1주)
- [6] + [7] + [8] + [10] = 팀 기능 완성 (2주)
