import { FastifyPluginAsync } from 'fastify';
import { BookingStatus } from '@prisma/client';
import { requireAuth, requirePermission } from '../plugins/auth';
import { Permission, RoleName } from '@lab/shared';
import { checkConflict } from '../lib/conflict';
import { assertTransition, InvalidTransitionError } from '../lib/state-machine';

// ─── 유틸 ─────────────────────────────────────────────────────

function parseDate(value: string, reply: any): Date | null {
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    reply.code(400).send({ ok: false, error: `유효하지 않은 날짜 형식: ${value}` });
    return null;
  }
  return d;
}

/**
 * 승인/반려 권한: admin 역할 또는 해당 자원의 ownerId
 */
function canManageBooking(role: string, userId: string, ownerId: string | null): boolean {
  return role === RoleName.ADMIN || ownerId === userId;
}

// ─── Route Plugin ─────────────────────────────────────────────

const bookingsRoute: FastifyPluginAsync = async (fastify) => {

  // ── GET /bookings ─────────────────────────────────────────
  fastify.get('/bookings', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_READ)],
    schema: {
      tags: ['bookings'],
      querystring: {
        type: 'object',
        properties: {
          resourceId: { type: 'string' },
          userId:     { type: 'string' },
          status:     { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'] },
          from:       { type: 'string' },
          to:         { type: 'string' },
          page:       { type: 'string' },
          limit:      { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const q = request.query as Record<string, string>;
    const page  = Math.max(1, parseInt(q.page  ?? '1'));
    const limit = Math.min(100, parseInt(q.limit ?? '20'));
    const skip  = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (q.resourceId) where.resourceId = q.resourceId;
    if (q.userId)     where.userId     = q.userId;
    if (q.status)     where.status     = q.status;
    if (q.from || q.to) {
      where.startAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to   ? { lte: new Date(q.to)   } : {}),
      };
    }

    const [data, total] = await Promise.all([
      fastify.prisma.booking.findMany({
        where,
        include: { resource: true },
        orderBy: { startAt: 'asc' },
        skip,
        take: limit,
      }),
      fastify.prisma.booking.count({ where }),
    ]);

    return { ok: true, data, total, page, limit };
  });

  // ── GET /bookings/:id ─────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/bookings/:id', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_READ)],
    schema: { tags: ['bookings'] },
  }, async (request, reply) => {
    const booking = await fastify.prisma.booking.findUnique({
      where: { id: request.params.id },
      include: { resource: true },
    });
    if (!booking) {
      return reply.code(404).send({ ok: false, error: '예약을 찾을 수 없습니다.' });
    }
    return { ok: true, data: booking };
  });

  // ── GET /calendar ─────────────────────────────────────────
  // 캘린더 뷰: 기간 내 APPROVED 예약 반환
  fastify.get('/calendar', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_READ)],
    schema: {
      tags: ['bookings'],
      querystring: {
        type: 'object',
        required: ['from', 'to'],
        properties: {
          from: { type: 'string' },
          to:   { type: 'string' },
          type: { type: 'string', enum: ['EQUIPMENT', 'ROOM'] },
        },
      },
    },
  }, async (request, reply) => {
    const { from, to, type } = request.query as { from: string; to: string; type?: string };

    const fromDate = parseDate(from, reply);
    const toDate   = parseDate(to, reply);
    if (!fromDate || !toDate) return;

    if (toDate <= fromDate) {
      return reply.code(400).send({ ok: false, error: 'to는 from보다 이후여야 합니다.' });
    }

    const data = await fastify.prisma.booking.findMany({
      where: {
        status: 'APPROVED',
        startAt: { lt: toDate },
        endAt:   { gt: fromDate },
        ...(type ? { resource: { type: type as 'EQUIPMENT' | 'ROOM' } } : {}),
      },
      include: { resource: true },
      orderBy: [{ resourceId: 'asc' }, { startAt: 'asc' }],
    });

    return { ok: true, data, total: data.length };
  });

  // ── POST /bookings ────────────────────────────────────────
  fastify.post('/bookings', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_WRITE)],
    schema: {
      tags: ['bookings'],
      body: {
        type: 'object',
        required: ['resourceId', 'title', 'startAt', 'endAt'],
        properties: {
          resourceId:  { type: 'string' },
          title:       { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 1000 },
          startAt:     { type: 'string' },
          endAt:       { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      resourceId: string; title: string; description?: string;
      startAt: string; endAt: string;
    };
    const userId = request.headers['x-user-id'] as string;

    const startAt = parseDate(body.startAt, reply);
    const endAt   = parseDate(body.endAt,   reply);
    if (!startAt || !endAt) return;

    if (endAt <= startAt) {
      return reply.code(400).send({ ok: false, error: 'endAt은 startAt보다 이후여야 합니다.' });
    }

    // 자원 유효성 확인
    const resource = await fastify.prisma.resource.findUnique({ where: { id: body.resourceId } });
    if (!resource) {
      return reply.code(404).send({ ok: false, error: '자원을 찾을 수 없습니다.' });
    }
    if (!resource.isActive) {
      return reply.code(400).send({ ok: false, error: '비활성화된 자원입니다.' });
    }

    // 1차 충돌 체크 (PENDING + APPROVED 상태 모두 검사)
    const conflict = await checkConflict(fastify.prisma, body.resourceId, startAt, endAt);
    if (conflict) {
      return reply.code(409).send({
        ok: false,
        error: '해당 시간대에 이미 예약이 존재합니다.',
        conflict: { bookingId: conflict.id, startAt: conflict.startAt, endAt: conflict.endAt },
      });
    }

    const booking = await fastify.prisma.booking.create({
      data: {
        resourceId:  body.resourceId,
        userId,
        title:       body.title,
        description: body.description ?? null,
        startAt,
        endAt,
        status: 'PENDING',
      },
      include: { resource: true },
    });

    // [알림 확장 포인트] await notifyBookingCreated(booking);

    return reply.code(201).send({ ok: true, data: booking });
  });

  // ── PUT /bookings/:id (내용 수정, PENDING 상태만 허용) ────
  fastify.put<{ Params: { id: string } }>('/bookings/:id', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_WRITE)],
    schema: { tags: ['bookings'] },
  }, async (request, reply) => {
    const userId = request.headers['x-user-id'] as string;
    const role   = request.headers['x-user-role'] as string;
    const body   = request.body as Record<string, unknown>;
    const { id } = request.params;

    const existing = await fastify.prisma.booking.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ ok: false, error: '예약을 찾을 수 없습니다.' });
    }
    if (existing.userId !== userId && role !== RoleName.ADMIN) {
      return reply.code(403).send({ ok: false, error: '본인의 예약만 수정할 수 있습니다.' });
    }
    if (existing.status !== 'PENDING') {
      return reply.code(400).send({ ok: false, error: 'PENDING 상태의 예약만 수정할 수 있습니다.' });
    }

    const update: Record<string, unknown> = {};
    if (body.title       !== undefined) update.title       = body.title;
    if (body.description !== undefined) update.description = body.description ?? null;

    // 시간 변경 시 충돌 재검사
    const newStart = body.startAt ? new Date(body.startAt as string) : existing.startAt;
    const newEnd   = body.endAt   ? new Date(body.endAt   as string) : existing.endAt;

    if (body.startAt || body.endAt) {
      if (newEnd <= newStart) {
        return reply.code(400).send({ ok: false, error: 'endAt은 startAt보다 이후여야 합니다.' });
      }
      const conflict = await checkConflict(fastify.prisma, existing.resourceId, newStart, newEnd, id);
      if (conflict) {
        return reply.code(409).send({
          ok: false,
          error: '해당 시간대에 이미 예약이 존재합니다.',
          conflict: { bookingId: conflict.id, startAt: conflict.startAt, endAt: conflict.endAt },
        });
      }
      update.startAt = newStart;
      update.endAt   = newEnd;
    }

    const booking = await fastify.prisma.booking.update({
      where: { id },
      data: update,
      include: { resource: true },
    });
    return { ok: true, data: booking };
  });

  // ── POST /bookings/:id/approve ────────────────────────────
  // 트랜잭션 + FOR UPDATE 락 + 승인 시점 재충돌 체크
  fastify.post<{ Params: { id: string } }>('/bookings/:id/approve', {
    preHandler: [requireAuth],
    schema: { tags: ['bookings'] },
  }, async (request, reply) => {
    const approvedBy = request.headers['x-user-id'] as string;
    const role       = request.headers['x-user-role'] as string;
    const { id }     = request.params;

    try {
      const booking = await fastify.prisma.$transaction(async (tx) => {
        // 1. 비관적 락: 같은 예약을 동시에 승인하는 race condition 방지
        await tx.$executeRaw`SELECT 1 FROM bookings WHERE id = ${id} FOR UPDATE`;

        const current = await tx.booking.findUnique({
          where: { id },
          include: { resource: true },
        });
        if (!current) {
          throw Object.assign(new Error('예약을 찾을 수 없습니다.'), { statusCode: 404 });
        }

        // 2. 권한 검증: admin 또는 자원 ownerId
        if (!canManageBooking(role, approvedBy, current.resource.ownerId)) {
          throw Object.assign(new Error('승인 권한이 없습니다.'), { statusCode: 403 });
        }

        // 3. 상태 머신 검증: PENDING → APPROVED만 허용
        assertTransition(current.status, 'APPROVED');

        // 4. 승인 시점 재충돌 체크 (APPROVED 상태만 검사)
        //    PENDING 상태 예약끼리는 허용 → 승인 순서에 따라 후발 예약은 reject
        const conflict = await checkConflict(
          tx,
          current.resourceId,
          current.startAt,
          current.endAt,
          id,
          ['APPROVED'],  // 이미 승인된 것과만 충돌 체크
        );
        if (conflict) {
          throw Object.assign(
            new Error('승인 시점에 시간 충돌이 발생했습니다. 다른 예약이 먼저 승인되었습니다.'),
            { statusCode: 409, conflict },
          );
        }

        // 5. 승인 처리
        return tx.booking.update({
          where: { id },
          data: { status: 'APPROVED', approvedBy, approvedAt: new Date() },
          include: { resource: true },
        });
      });

      // [알림 확장 포인트] await notifyBookingApproved(booking);

      return { ok: true, data: booking };
    } catch (err: any) {
      if (err.statusCode === 404) return reply.code(404).send({ ok: false, error: err.message });
      if (err.statusCode === 403) return reply.code(403).send({ ok: false, error: err.message });
      if (err.statusCode === 409) {
        return reply.code(409).send({
          ok: false,
          error: err.message,
          conflict: err.conflict,
        });
      }
      if (err instanceof InvalidTransitionError) {
        return reply.code(400).send({ ok: false, error: err.message });
      }
      throw err;
    }
  });

  // ── POST /bookings/:id/reject ─────────────────────────────
  fastify.post<{ Params: { id: string } }>('/bookings/:id/reject', {
    preHandler: [requireAuth],
    schema: {
      tags: ['bookings'],
      body: {
        type: 'object',
        properties: { reason: { type: 'string', maxLength: 500 } },
      },
    },
  }, async (request, reply) => {
    const userId = request.headers['x-user-id'] as string;
    const role   = request.headers['x-user-role'] as string;
    const { id } = request.params;
    const { reason } = (request.body as any) ?? {};

    try {
      const booking = await fastify.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM bookings WHERE id = ${id} FOR UPDATE`;

        const current = await tx.booking.findUnique({
          where: { id },
          include: { resource: true },
        });
        if (!current) {
          throw Object.assign(new Error('예약을 찾을 수 없습니다.'), { statusCode: 404 });
        }
        if (!canManageBooking(role, userId, current.resource.ownerId)) {
          throw Object.assign(new Error('반려 권한이 없습니다.'), { statusCode: 403 });
        }

        assertTransition(current.status, 'REJECTED');

        return tx.booking.update({
          where: { id },
          data: { status: 'REJECTED', rejectedReason: reason ?? null },
          include: { resource: true },
        });
      });

      // [알림 확장 포인트] await notifyBookingRejected(booking);

      return { ok: true, data: booking };
    } catch (err: any) {
      if (err.statusCode === 404) return reply.code(404).send({ ok: false, error: err.message });
      if (err.statusCode === 403) return reply.code(403).send({ ok: false, error: err.message });
      if (err instanceof InvalidTransitionError) return reply.code(400).send({ ok: false, error: err.message });
      throw err;
    }
  });

  // ── POST /bookings/:id/cancel ─────────────────────────────
  fastify.post<{ Params: { id: string } }>('/bookings/:id/cancel', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_WRITE)],
    schema: { tags: ['bookings'] },
  }, async (request, reply) => {
    const userId = request.headers['x-user-id'] as string;
    const role   = request.headers['x-user-role'] as string;
    const { id } = request.params;

    try {
      const booking = await fastify.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM bookings WHERE id = ${id} FOR UPDATE`;

        const current = await tx.booking.findUnique({
          where: { id },
          include: { resource: true },
        });
        if (!current) {
          throw Object.assign(new Error('예약을 찾을 수 없습니다.'), { statusCode: 404 });
        }
        if (current.userId !== userId && role !== RoleName.ADMIN) {
          throw Object.assign(new Error('본인의 예약만 취소할 수 있습니다.'), { statusCode: 403 });
        }

        assertTransition(current.status, 'CANCELLED');

        return tx.booking.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
          include: { resource: true },
        });
      });

      // [알림 확장 포인트] await notifyBookingCancelled(booking);

      return { ok: true, data: booking };
    } catch (err: any) {
      if (err.statusCode === 404) return reply.code(404).send({ ok: false, error: err.message });
      if (err.statusCode === 403) return reply.code(403).send({ ok: false, error: err.message });
      if (err instanceof InvalidTransitionError) return reply.code(400).send({ ok: false, error: err.message });
      throw err;
    }
  });

  // ── POST /bookings/:id/complete ───────────────────────────
  fastify.post<{ Params: { id: string } }>('/bookings/:id/complete', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_WRITE)],
    schema: { tags: ['bookings'] },
  }, async (request, reply) => {
    const userId = request.headers['x-user-id'] as string;
    const role   = request.headers['x-user-role'] as string;
    const { id } = request.params;

    try {
      const booking = await fastify.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM bookings WHERE id = ${id} FOR UPDATE`;

        const current = await tx.booking.findUnique({ where: { id } });
        if (!current) {
          throw Object.assign(new Error('예약을 찾을 수 없습니다.'), { statusCode: 404 });
        }
        if (current.userId !== userId && role !== RoleName.ADMIN) {
          throw Object.assign(new Error('본인의 예약만 완료 처리할 수 있습니다.'), { statusCode: 403 });
        }

        assertTransition(current.status, 'COMPLETED');

        return tx.booking.update({
          where: { id },
          data: { status: 'COMPLETED', completedAt: new Date() },
          include: { resource: true },
        });
      });

      return { ok: true, data: booking };
    } catch (err: any) {
      if (err.statusCode === 404) return reply.code(404).send({ ok: false, error: err.message });
      if (err.statusCode === 403) return reply.code(403).send({ ok: false, error: err.message });
      if (err instanceof InvalidTransitionError) return reply.code(400).send({ ok: false, error: err.message });
      throw err;
    }
  });
};

export default bookingsRoute;
