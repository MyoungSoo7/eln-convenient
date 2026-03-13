import { Router } from 'express';
import * as ctrl from '../controllers/scheduler.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/resources',              requirePermission('scheduler:read'),    ctrl.getResources);
router.get('/bookings',               requirePermission('scheduler:read'),    ctrl.getBookings);
router.post('/bookings',              requirePermission('scheduler:write'),   ctrl.createBooking);
router.put('/bookings/:id',           requirePermission('scheduler:write'),   ctrl.updateBooking);
router.delete('/bookings/:id',        requirePermission('scheduler:write'),   ctrl.deleteBooking);
router.put('/bookings/:id/approve',   requirePermission('scheduler:write'),   ctrl.approveBooking);
router.put('/bookings/:id/reject',    requirePermission('scheduler:write'),   ctrl.rejectBooking);

export default router;
