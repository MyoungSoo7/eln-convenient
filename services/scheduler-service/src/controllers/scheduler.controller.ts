import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { IResource, IBooking } from '../interfaces/scheduler.interface';

const DUMMY_RESOURCES: IResource[] = [
  { id: 'res-001', name: 'PCR Thermocycler #1', type: 'equipment', location: 'A동 302호', isActive: true },
  { id: 'res-002', name: 'HPLC 시스템', type: 'equipment', location: 'B동 201호', isActive: true },
  { id: 'res-003', name: '세미나실 A', type: 'room', location: 'C동 101호', isActive: true },
];

const DUMMY_BOOKINGS: IBooking[] = [
  { id: 'book-001', resourceId: 'res-001', userId: 'dev-user-001', title: 'PCR 실험', startTime: '2024-01-20T09:00:00Z', endTime: '2024-01-20T12:00:00Z', status: 'approved', approvedBy: 'dev-user-001', createdAt: '2024-01-18T10:00:00Z' },
];

export function getResources(_req: Request, res: Response): void {
  res.json({ data: DUMMY_RESOURCES, total: DUMMY_RESOURCES.length });
}

export function getBookings(req: Request, res: Response): void {
  let bookings = DUMMY_BOOKINGS;
  if (req.query.resourceId) bookings = bookings.filter((b) => b.resourceId === req.query.resourceId);
  res.json({ data: bookings, total: bookings.length });
}

export function createBooking(req: Request, res: Response): void {
  const booking: IBooking = {
    id: uuidv4(), ...req.body, userId: req.headers['x-user-id'] as string || 'dev-user-001',
    status: 'pending', createdAt: new Date().toISOString(),
  };
  res.status(201).json(booking);
}

export function updateBooking(req: Request, res: Response): void {
  res.json({ id: req.params.id, ...req.body, message: '예약이 수정되었습니다.' });
}

export function deleteBooking(req: Request, res: Response): void {
  res.json({ id: req.params.id, status: 'cancelled', message: '예약이 취소되었습니다.' });
}

export function approveBooking(req: Request, res: Response): void {
  res.json({ id: req.params.id, status: 'approved', approvedBy: req.headers['x-user-id'], message: '예약이 승인되었습니다.' });
}

export function rejectBooking(req: Request, res: Response): void {
  res.json({ id: req.params.id, status: 'rejected', message: '예약이 거절되었습니다.' });
}
