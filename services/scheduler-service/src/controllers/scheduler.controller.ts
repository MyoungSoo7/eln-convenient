import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

// ─────────────────────────────────────────────
// 자원(Resource) CRUD
// ─────────────────────────────────────────────

/** GET /api/scheduler/resources */
export async function getResources(req: Request, res: Response): Promise<void> {
  try {
    const { type, isActive } = req.query;
    const where: Record<string, unknown> = {};

    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    else where.isActive = true; // 기본: 활성 자원만

    const resources = await prisma.resource.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json({ ok: true, data: resources, total: resources.length });
  } catch (err) {
    console.error('[getResources]', err);
    res.status(500).json({ ok: false, error: '자원 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/scheduler/resources */
export async function createResource(req: Request, res: Response): Promise<void> {
  const { name, type } = req.body;
  if (!name?.trim() || !type) {
    res.status(400).json({ ok: false, error: 'name과 type은 필수입니다.' });
    return;
  }
  if (!['equipment', 'room'].includes(type)) {
    res.status(400).json({ ok: false, error: 'type은 equipment 또는 room이어야 합니다.' });
    return;
  }

  try {
    const resource = await prisma.resource.create({
      data: {
        id: uuidv4(),
        name: name.trim(),
        type,
        location: req.body.location || null,
        description: req.body.description || null,
        capacity: req.body.capacity ?? null,
      },
    });
    res.status(201).json({ ok: true, data: resource });
  } catch (err: any) {
    console.error('[createResource]', err);
    res.status(500).json({ ok: false, error: '자원 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/scheduler/resources/:id */
export async function updateResource(req: Request, res: Response): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {};
    if (req.body.name !== undefined) updateData.name = req.body.name.trim();
    if (req.body.type !== undefined) {
      if (!['equipment', 'room'].includes(req.body.type)) {
        res.status(400).json({ ok: false, error: 'type은 equipment 또는 room이어야 합니다.' });
        return;
      }
      updateData.type = req.body.type;
    }
    if (req.body.location !== undefined) updateData.location = req.body.location || null;
    if (req.body.description !== undefined) updateData.description = req.body.description || null;
    if (req.body.capacity !== undefined) updateData.capacity = req.body.capacity;
    if (req.body.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive);

    const resource = await prisma.resource.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({ ok: true, data: resource });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '자원을 찾을 수 없습니다.' });
      return;
    }
    console.error('[updateResource]', err);
    res.status(500).json({ ok: false, error: '자원 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/scheduler/resources/:id (soft delete) */
export async function deleteResource(req: Request, res: Response): Promise<void> {
  try {
    const resource = await prisma.resource.findUnique({ where: { id: req.params.id } });
    if (!resource) {
      res.status(404).json({ ok: false, error: '자원을 찾을 수 없습니다.' });
      return;
    }

    // 진행 중인 예약이 있으면 삭제 불가
    const activeBookings = await prisma.booking.count({
      where: {
        resourceId: req.params.id,
        status: { in: ['pending', 'approved'] },
      },
    });
    if (activeBookings > 0) {
      res.status(409).json({ ok: false, error: `진행 중인 예약이 ${activeBookings}건 있어 비활성화할 수 없습니다.` });
      return;
    }

    await prisma.resource.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ ok: true, message: '자원이 비활성화되었습니다.', id: req.params.id });
  } catch (err) {
    console.error('[deleteResource]', err);
    res.status(500).json({ ok: false, error: '자원 비활성화 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 예약(Booking) CRUD
// ─────────────────────────────────────────────

/** GET /api/scheduler/bookings */
export async function getBookings(req: Request, res: Response): Promise<void> {
  try {
    const { resourceId, userId, status, from, to, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: Record<string, unknown> = {};
    if (resourceId) where.resourceId = resourceId;
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (from || to) {
      where.startTime = {
        ...(from && { gte: new Date(from as string) }),
        ...(to && { lte: new Date(to as string) }),
      };
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: { resource: true },
        orderBy: { startTime: 'asc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({ ok: true, data: bookings, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err) {
    console.error('[getBookings]', err);
    res.status(500).json({ ok: false, error: '예약 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/scheduler/bookings */
export async function createBooking(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';
  const { resourceId, title, startTime, endTime, description } = req.body;

  if (!resourceId || !title || !startTime || !endTime) {
    res.status(400).json({ ok: false, error: 'resourceId, title, startTime, endTime는 필수입니다.' });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ ok: false, error: '유효하지 않은 날짜 형식입니다.' });
    return;
  }
  if (end <= start) {
    res.status(400).json({ ok: false, error: 'endTime은 startTime보다 이후여야 합니다.' });
    return;
  }

  try {
    // 자원 존재 및 활성 확인
    const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource) {
      res.status(404).json({ ok: false, error: '자원을 찾을 수 없습니다.' });
      return;
    }
    if (!resource.isActive) {
      res.status(400).json({ ok: false, error: '비활성화된 자원입니다.' });
      return;
    }

    // 중복 예약 체크
    const conflict = await prisma.booking.findFirst({
      where: {
        resourceId,
        status: { in: ['pending', 'approved'] },
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } },
        ],
      },
    });
    if (conflict) {
      res.status(409).json({ ok: false, error: '해당 시간에 이미 예약이 존재합니다.' });
      return;
    }

    const booking = await prisma.booking.create({
      data: {
        id: uuidv4(),
        resourceId,
        userId,
        title,
        description: description || null,
        startTime: start,
        endTime: end,
        status: 'pending',
      },
      include: { resource: true },
    });
    res.status(201).json({ ok: true, data: booking });
  } catch (err) {
    console.error('[createBooking]', err);
    res.status(500).json({ ok: false, error: '예약 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/scheduler/bookings/:id */
export async function updateBooking(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: '예약을 찾을 수 없습니다.' });
      return;
    }

    // 본인 예약이거나 admin만 수정 가능
    if (existing.userId !== userId && userRole !== 'admin' && userRole !== 'lab_manager') {
      res.status(403).json({ ok: false, error: '본인의 예약만 수정할 수 있습니다.' });
      return;
    }

    // 취소/거절된 예약은 수정 불가
    if (['cancelled', 'rejected'].includes(existing.status)) {
      res.status(400).json({ ok: false, error: `${existing.status === 'cancelled' ? '취소된' : '거절된'} 예약은 수정할 수 없습니다.` });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description || null;

    // 시간 변경 시 중복 체크
    const newStart = req.body.startTime ? new Date(req.body.startTime) : existing.startTime;
    const newEnd = req.body.endTime ? new Date(req.body.endTime) : existing.endTime;

    if (req.body.startTime || req.body.endTime) {
      if (newEnd <= newStart) {
        res.status(400).json({ ok: false, error: 'endTime은 startTime보다 이후여야 합니다.' });
        return;
      }

      const conflict = await prisma.booking.findFirst({
        where: {
          id: { not: req.params.id },
          resourceId: existing.resourceId,
          status: { in: ['pending', 'approved'] },
          AND: [
            { startTime: { lt: newEnd } },
            { endTime: { gt: newStart } },
          ],
        },
      });
      if (conflict) {
        res.status(409).json({ ok: false, error: '해당 시간에 이미 예약이 존재합니다.' });
        return;
      }

      updateData.startTime = newStart;
      updateData.endTime = newEnd;
      // 승인된 예약 시간 변경 시 pending으로 되돌림
      if (existing.status === 'approved') {
        updateData.status = 'pending';
        updateData.approvedBy = null;
      }
    }

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: updateData,
      include: { resource: true },
    });
    res.json({ ok: true, data: booking });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '예약을 찾을 수 없습니다.' });
      return;
    }
    console.error('[updateBooking]', err);
    res.status(500).json({ ok: false, error: '예약 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/scheduler/bookings/:id (soft delete → cancelled) */
export async function deleteBooking(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: '예약을 찾을 수 없습니다.' });
      return;
    }

    // 본인 예약이거나 admin만 취소 가능
    if (existing.userId !== userId && userRole !== 'admin' && userRole !== 'lab_manager') {
      res.status(403).json({ ok: false, error: '본인의 예약만 취소할 수 있습니다.' });
      return;
    }

    if (existing.status === 'cancelled') {
      res.status(400).json({ ok: false, error: '이미 취소된 예약입니다.' });
      return;
    }

    await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true, id: req.params.id, status: 'cancelled', message: '예약이 취소되었습니다.' });
  } catch (err) {
    console.error('[deleteBooking]', err);
    res.status(500).json({ ok: false, error: '예약 취소 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 승인 흐름
// ─────────────────────────────────────────────

/** PUT /api/scheduler/bookings/:id/approve */
export async function approveBooking(req: Request, res: Response): Promise<void> {
  const approvedBy = req.headers['x-user-id'] as string;

  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: '예약을 찾을 수 없습니다.' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(400).json({ ok: false, error: `승인 대기(pending) 상태의 예약만 승인할 수 있습니다. 현재 상태: ${existing.status}` });
      return;
    }

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'approved', approvedBy },
      include: { resource: true },
    });
    res.json({ ok: true, data: booking });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '예약을 찾을 수 없습니다.' });
      return;
    }
    console.error('[approveBooking]', err);
    res.status(500).json({ ok: false, error: '예약 승인 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/scheduler/bookings/:id/reject */
export async function rejectBooking(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: '예약을 찾을 수 없습니다.' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(400).json({ ok: false, error: `승인 대기(pending) 상태의 예약만 거절할 수 있습니다. 현재 상태: ${existing.status}` });
      return;
    }

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        rejectedReason: req.body.reason || null,
      },
      include: { resource: true },
    });
    res.json({ ok: true, data: booking });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '예약을 찾을 수 없습니다.' });
      return;
    }
    console.error('[rejectBooking]', err);
    res.status(500).json({ ok: false, error: '예약 거절 중 오류가 발생했습니다.' });
  }
}
