/**
 * 예약 라우트 통합 테스트
 *
 * Prisma를 vi.mock으로 대체하여 DB 없이 라우트 로직을 검증합니다.
 * Fastify의 inject()를 사용해 HTTP 레벨에서 테스트합니다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app';
import { Permission } from '@lab/shared';

// ─── Prisma 모킹 ──────────────────────────────────────────────
vi.mock('../lib/prisma', () => ({
  default: {
    resource: {
      // 라우트는 org 스코핑 이후 findFirst({ where: { id, orgId } }) 를 쓴다.
      // findUnique 는 orgId 를 복합키로 받지 못해 테넌트 격리가 불가능하므로 폐기됐다.
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
    },
    booking: {
      findFirst:  vi.fn(),
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw:  vi.fn(),
    $disconnect:  vi.fn(),
  },
}));

// ─── 픽스처 ───────────────────────────────────────────────────
const RESOURCE = {
  id: 'res-001',
  orgId: 'org-001',
  name: '전자현미경',
  type: 'EQUIPMENT',
  location: 'A동 101호',
  description: null,
  capacity: null,
  ownerId: null,
  isActive: true,
  createdAt: new Date('2026-01-01'),
};

const BOOKING_PENDING = {
  id: 'booking-001',
  // 승인/반려/취소 라우트는 트랜잭션 안에서 current.orgId 를 요청 헤더의 orgId 와
  // 대조해 다른 조직 예약을 404 로 숨긴다. 픽스처에 이 필드가 없으면 undefined 와
  // 비교돼 정상 케이스까지 전부 404 가 된다.
  orgId: 'org-001',
  resourceId: 'res-001',
  userId: 'user-001',
  title: '시료 분석',
  description: null,
  startAt: new Date('2026-03-20T09:00:00Z'),
  endAt:   new Date('2026-03-20T11:00:00Z'),
  status: 'PENDING',
  approvedBy: null,
  approvedAt: null,
  rejectedReason: null,
  cancelledAt: null,
  completedAt: null,
  createdAt: new Date('2026-03-18'),
  resource: RESOURCE,
};

// 라우트는 startAt <= now 를 BOOKING_PAST_DATE(400) 으로 먼저 막는다. 그래서 예약
// 페이로드의 시각을 절대값으로 박아 두면 그 날짜가 지나는 순간 모든 케이스가 그
// 가드에 먼저 걸려, 정작 검증하려던 201/409/비활성자원 분기까지 전부 400 으로
// 뒤집힌다. eln 브랜치가 2026-03 기준으로 작성돼 실제로 그렇게 썩어 있었다.
// 시각은 항상 '지금으로부터 N 시간' 으로 만들어 시계에 의존하지 않게 한다.
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

// ─── 헬퍼 ────────────────────────────────────────────────────
/** body 포함 요청용 헤더 */
function adminHeaders() {
  return {
    'x-user-id':          'user-admin-001',
    'x-user-role':        'admin',
    'x-user-permissions': JSON.stringify([Permission.SCHEDULER_READ, Permission.SCHEDULER_WRITE]),
    'x-user-org-id':      'org-001',
    'content-type':       'application/json',
  };
}

/** body 없는 요청용 헤더 (content-type 제거 - Fastify 빈 body 파싱 오류 방지) */
function adminHeadersNoBody() {
  return {
    'x-user-id':   'user-admin-001',
    'x-user-role': 'admin',
    'x-user-permissions': JSON.stringify([Permission.SCHEDULER_READ, Permission.SCHEDULER_WRITE]),
    'x-user-org-id':      'org-001',
  };
}

function userHeaders(userId = 'user-001') {
  return {
    'x-user-id':          userId,
    'x-user-role':        'researcher',
    'x-user-permissions': JSON.stringify([Permission.SCHEDULER_READ, Permission.SCHEDULER_WRITE]),
    'x-user-org-id':      'org-001',
    'content-type':       'application/json',
  };
}

function userHeadersNoBody(userId = 'user-001') {
  return {
    'x-user-id':   userId,
    'x-user-role': 'researcher',
    'x-user-permissions': JSON.stringify([Permission.SCHEDULER_READ, Permission.SCHEDULER_WRITE]),
    'x-user-org-id':      'org-001',
  };
}

// ─── 테스트 ───────────────────────────────────────────────────
describe('POST /api/scheduler/bookings - 예약 생성', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  it('정상 예약 생성 → 201', async () => {
    const prisma = (await import('../lib/prisma')).default as any;
    prisma.resource.findFirst.mockResolvedValue(RESOURCE);
    prisma.booking.findFirst.mockResolvedValue(null);  // 충돌 없음
    prisma.booking.create.mockResolvedValue({ ...BOOKING_PENDING });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: {
        resourceId: 'res-001',
        title: '시료 분석',
        startAt: hoursFromNow(24),
        endAt:   hoursFromNow(26),
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('PENDING');
  });

  it('시간 충돌 시 → 409', async () => {
    const prisma = (await import('../lib/prisma')).default as any;
    prisma.resource.findFirst.mockResolvedValue(RESOURCE);
    prisma.booking.findFirst.mockResolvedValue({
      id: 'conflict-booking',
      startAt: new Date(hoursFromNow(23.5)),
      endAt:   new Date(hoursFromNow(25)),
      userId:  'user-002',
      status:  'PENDING',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: {
        resourceId: 'res-001',
        title: '충돌 예약',
        startAt: hoursFromNow(24.5),
        endAt:   hoursFromNow(26),
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.ok).toBe(false);
    // rd-team 머지 전에는 409 본문에 conflict: { bookingId, startAt, endAt } 이 실렸다.
    // 그 커밋이 라우트를 AppError 로 통일하면서 상세 payload 가 사라졌다. 프론트는
    // 충돌을 이미 로드한 예약 목록에서 클라이언트단으로 계산하므로(SchedulerPage
    // conflictingBooking) 상세를 쓰지 않는다. 계약은 상태코드와 에러코드다.
    expect(body.code).toBe('BOOKING_CONFLICT');
  });

  it('endAt <= startAt → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: {
        resourceId: 'res-001',
        title: '잘못된 시간',
        startAt: hoursFromNow(26),
        endAt:   hoursFromNow(24),  // 종료가 시작보다 앞
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
    // 400 만 보면 과거시각 가드에 걸려도 통과한다. 실제로 이 테스트는 날짜가 지난
    // 뒤 BOOKING_PAST_DATE 로 초록이 떠 있었다. 어느 가드가 잡았는지까지 못박는다.
    expect(res.json().code).toBe('BOOKING_INVALID_DATE');
  });

  it('비활성 자원 예약 시 → 400', async () => {
    const prisma = (await import('../lib/prisma')).default as any;
    prisma.resource.findFirst.mockResolvedValue({ ...RESOURCE, isActive: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: {
        resourceId: 'res-001',
        title: '비활성 자원 예약',
        startAt: hoursFromNow(24),
        endAt:   hoursFromNow(26),
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('비활성화');
  });

  // 위 케이스들을 상대시각으로 바꾸면 과거시각 가드를 아무도 안 밟는다. 가드는
  // 실재하는 계약이므로 직접 겨냥한 케이스를 따로 둔다.
  it('과거 시각 예약 → 400', async () => {
    const prisma = (await import('../lib/prisma')).default as any;
    prisma.resource.findFirst.mockResolvedValue(RESOURCE);

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: {
        resourceId: 'res-001',
        title: '과거 예약',
        startAt: hoursFromNow(-2),
        endAt:   hoursFromNow(-1),
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BOOKING_PAST_DATE');
  });

  it('인증 헤더 없으면 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: { 'content-type': 'application/json' },
      payload: {
        resourceId: 'res-001',
        title: '미인증 예약',
        startAt: hoursFromNow(24),
        endAt:   hoursFromNow(26),
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('필수 필드 누락 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: { title: '제목만 있음' },  // resourceId, startAt, endAt 누락
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── 승인 테스트 ──────────────────────────────────────────────
describe('POST /api/scheduler/bookings/:id/approve - 예약 승인', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  it('관리자가 PENDING 예약 승인 → 200', async () => {
    const prisma = (await import('../lib/prisma')).default as any;
    const approved = { ...BOOKING_PENDING, status: 'APPROVED', approvedBy: 'user-admin-001', approvedAt: new Date() };

    prisma.$transaction.mockImplementation(async (fn: Function) => fn(prisma));
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.booking.findUnique.mockResolvedValue({ ...BOOKING_PENDING, resource: RESOURCE });
    prisma.booking.findFirst.mockResolvedValue(null);  // 재충돌 없음
    prisma.booking.update.mockResolvedValue({ ...approved, resource: RESOURCE });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings/booking-001/approve',
      headers: adminHeadersNoBody(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('APPROVED');
  });

  it('일반 사용자가 승인 시도 → 403', async () => {
    const prisma = (await import('../lib/prisma')).default as any;

    prisma.$transaction.mockImplementation(async (fn: Function) => fn(prisma));
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.booking.findUnique.mockResolvedValue({
      ...BOOKING_PENDING,
      resource: { ...RESOURCE, ownerId: null },  // ownerId 없음
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings/booking-001/approve',
      headers: userHeadersNoBody('user-999'),  // 다른 사용자
    });

    expect(res.statusCode).toBe(403);
  });

  it('이미 승인된 예약 재승인 시도 → 400 (InvalidTransition)', async () => {
    const prisma = (await import('../lib/prisma')).default as any;

    prisma.$transaction.mockImplementation(async (fn: Function) => fn(prisma));
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.booking.findUnique.mockResolvedValue({
      ...BOOKING_PENDING,
      status: 'APPROVED',  // 이미 승인됨
      resource: RESOURCE,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings/booking-001/approve',
      headers: adminHeadersNoBody(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('APPROVED → APPROVED');
  });

  it('존재하지 않는 예약 → 404', async () => {
    const prisma = (await import('../lib/prisma')).default as any;

    prisma.$transaction.mockImplementation(async (fn: Function) => fn(prisma));
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.booking.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings/nonexistent-id/approve',
      headers: adminHeadersNoBody(),
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─── 취소 테스트 ──────────────────────────────────────────────
describe('POST /api/scheduler/bookings/:id/cancel - 예약 취소', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  it('예약자 본인이 취소 → 200', async () => {
    const prisma = (await import('../lib/prisma')).default as any;
    const cancelled = { ...BOOKING_PENDING, status: 'CANCELLED', cancelledAt: new Date() };

    prisma.$transaction.mockImplementation(async (fn: Function) => fn(prisma));
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.booking.findUnique.mockResolvedValue({ ...BOOKING_PENDING, resource: RESOURCE });
    prisma.booking.update.mockResolvedValue({ ...cancelled, resource: RESOURCE });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings/booking-001/cancel',
      headers: userHeadersNoBody('user-001'),  // 예약자 본인
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('CANCELLED');
  });

  it('타인 예약 취소 시도 → 403', async () => {
    const prisma = (await import('../lib/prisma')).default as any;

    prisma.$transaction.mockImplementation(async (fn: Function) => fn(prisma));
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.booking.findUnique.mockResolvedValue({ ...BOOKING_PENDING, resource: RESOURCE });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings/booking-001/cancel',
      headers: userHeadersNoBody('user-999'),  // 다른 사용자
    });

    expect(res.statusCode).toBe(403);
  });

  it('REJECTED 상태 취소 시도 → 400 (InvalidTransition)', async () => {
    const prisma = (await import('../lib/prisma')).default as any;

    prisma.$transaction.mockImplementation(async (fn: Function) => fn(prisma));
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.booking.findUnique.mockResolvedValue({
      ...BOOKING_PENDING,
      status: 'REJECTED',  // 종단 상태
      resource: RESOURCE,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings/booking-001/cancel',
      headers: adminHeadersNoBody(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('REJECTED → CANCELLED');
  });
});

// ─── 헬스체크 ─────────────────────────────────────────────────
describe('GET /health', () => {
  it('200 OK', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});
