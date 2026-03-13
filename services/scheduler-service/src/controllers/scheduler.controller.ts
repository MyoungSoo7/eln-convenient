import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

export async function getResources(_req: Request, res: Response): Promise<void> {
  const resources = await prisma.resource.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json({ data: resources, total: resources.length });
}

export async function getBookings(req: Request, res: Response): Promise<void> {
  const { resourceId, userId, from, to, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Record<string, unknown> = {};
  if (resourceId) where.resourceId = resourceId;
  if (userId) where.userId = userId;
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

  res.json({ data: bookings, total });
}

export async function createBooking(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string || 'anonymous';
  const { resourceId, title, startTime, endTime } = req.body;
  if (!resourceId || !title || !startTime || !endTime) {
    res.status(400).json({ error: 'resourceId, title, startTime, endTime는 필수입니다.' });
    return;
  }

  // 중복 예약 체크
  const conflict = await prisma.booking.findFirst({
    where: {
      resourceId,
      status: { in: ['pending', 'approved'] },
      AND: [
        { startTime: { lt: new Date(endTime) } },
        { endTime: { gt: new Date(startTime) } },
      ],
    },
  });
  if (conflict) {
    res.status(409).json({ error: '해당 시간에 이미 예약이 존재합니다.' });
    return;
  }

  const booking = await prisma.booking.create({
    data: {
      id: uuidv4(),
      resourceId,
      userId,
      title,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: 'pending',
    },
    include: { resource: true },
  });
  res.status(201).json(booking);
}

export async function updateBooking(req: Request, res: Response): Promise<void> {
  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data: {
      ...(req.body.title && { title: req.body.title }),
      ...(req.body.startTime && { startTime: new Date(req.body.startTime) }),
      ...(req.body.endTime && { endTime: new Date(req.body.endTime) }),
    },
  });
  res.json(booking);
}

export async function deleteBooking(req: Request, res: Response): Promise<void> {
  await prisma.booking.update({
    where: { id: req.params.id },
    data: { status: 'cancelled' },
  });
  res.json({ id: req.params.id, status: 'cancelled', message: '예약이 취소되었습니다.' });
}

export async function approveBooking(req: Request, res: Response): Promise<void> {
  const approvedBy = req.headers['x-user-id'] as string;
  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data: { status: 'approved', approvedBy },
  });
  res.json(booking);
}

export async function rejectBooking(req: Request, res: Response): Promise<void> {
  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data: { status: 'rejected' },
  });
  res.json(booking);
}
