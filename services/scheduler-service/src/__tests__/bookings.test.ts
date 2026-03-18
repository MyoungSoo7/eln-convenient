/**
 * 예약 라우트 통합 테스트
 *
 * Prisma를 vi.mock으로 대체하여 DB 없이 라우트 로직을 검증합니다.
 * Fastify의 inject()를 사용해 HTTP 레벨에서 테스트합니다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app';

// ─── Prisma 모킹 ──────────────────────────────────────────────
vi.mock('../lib/prisma', () => ({
  default: {
    resource: {
      findUnique: vi.fn(),
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

// ─── 헬퍼 ────────────────────────────────────────────────────
/** body 포함 요청용 헤더 */
function adminHeaders() {
  return {
    'x-user-id':          'user-admin-001',
    'x-user-role':        'admin',
    'x-user-permissions': '["scheduler:read","scheduler:write"]',
    'content-type':       'application/json',
  };
}

/** body 없는 요청용 헤더 (content-type 제거 - Fastify 빈 body 파싱 오류 방지) */
function adminHeadersNoBody() {
  return {
    'x-user-id':   'user-admin-001',
    'x-user-role': 'admin',
    'x-user-permissions': '["scheduler:read","scheduler:write"]',
  };
}

function userHeaders(userId = 'user-001') {
  return {
    'x-user-id':          userId,
    'x-user-role':        'researcher',
    'x-user-permissions': '["scheduler:read","scheduler:write"]',
    'content-type':       'application/json',
  };
}

function userHeadersNoBody(userId = 'user-001') {
  return {
    'x-user-id':   userId,
    'x-user-role': 'researcher',
    'x-user-permissions': '["scheduler:read","scheduler:write"]',
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
    prisma.resource.findUnique.mockResolvedValue(RESOURCE);
    prisma.booking.findFirst.mockResolvedValue(null);  // 충돌 없음
    prisma.booking.create.mockResolvedValue({ ...BOOKING_PENDING });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: {
        resourceId: 'res-001',
        title: '시료 분석',
        startAt: '2026-03-20T09:00:00Z',
        endAt:   '2026-03-20T11:00:00Z',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('PENDING');
  });

  it('시간 충돌 시 → 409', async () => {
    const prisma = (await import('../lib/prisma')).default as any;
    prisma.resource.findUnique.mockResolvedValue(RESOURCE);
    prisma.booking.findFirst.mockResolvedValue({
      id: 'conflict-booking',
      startAt: new Date('2026-03-20T08:30:00Z'),
      endAt:   new Date('2026-03-20T10:00:00Z'),
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
        startAt: '2026-03-20T09:30:00Z',
        endAt:   '2026-03-20T11:00:00Z',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.conflict).toBeDefined();
  });

  it('endAt <= startAt → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: {
        resourceId: 'res-001',
        title: '잘못된 시간',
        startAt: '2026-03-20T11:00:00Z',
        endAt:   '2026-03-20T09:00:00Z',  // 종료가 시작보다 앞
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
  });

  it('비활성 자원 예약 시 → 400', async () => {
    const prisma = (await import('../lib/prisma')).default as any;
    prisma.resource.findUnique.mockResolvedValue({ ...RESOURCE, isActive: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: userHeaders(),
      payload: {
        resourceId: 'res-001',
        title: '비활성 자원 예약',
        startAt: '2026-03-20T09:00:00Z',
        endAt:   '2026-03-20T11:00:00Z',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('비활성화');
  });

  it('인증 헤더 없으면 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduler/bookings',
      headers: { 'content-type': 'application/json' },
      payload: {
        resourceId: 'res-001',
        title: '미인증 예약',
        startAt: '2026-03-20T09:00:00Z',
        endAt:   '2026-03-20T11:00:00Z',
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
