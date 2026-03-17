import { Router } from 'express';
import * as ctrl from '../controllers/scheduler.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// ── 자원(Resource) CRUD ───────────────────────────────────
router.get('/resources',            requirePermission('scheduler:read'),   ctrl.getResources);
router.post('/resources',           requireRole('admin', 'lab_manager'),   ctrl.createResource);
router.put('/resources/:id',        requireRole('admin', 'lab_manager'),   ctrl.updateResource);
router.delete('/resources/:id',     requireRole('admin', 'lab_manager'),   ctrl.deleteResource);

// ── 예약(Booking) CRUD ────────────────────────────────────
router.get('/bookings',             requirePermission('scheduler:read'),   ctrl.getBookings);
router.post('/bookings',            requirePermission('scheduler:write'),  ctrl.createBooking);
router.put('/bookings/:id',         requirePermission('scheduler:write'),  ctrl.updateBooking);
router.delete('/bookings/:id',      requirePermission('scheduler:write'),  ctrl.deleteBooking);

// ── 승인 흐름 ─────────────────────────────────────────────
router.put('/bookings/:id/approve', requireRole('admin', 'lab_manager'),   ctrl.approveBooking);
router.put('/bookings/:id/reject',  requireRole('admin', 'lab_manager'),   ctrl.rejectBooking);

export default router;
