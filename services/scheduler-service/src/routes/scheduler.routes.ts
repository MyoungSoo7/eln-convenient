import { Router } from 'express';
import * as ctrl from '../controllers/scheduler.controller';

const router = Router();

router.get('/resources', ctrl.getResources);
router.get('/bookings', ctrl.getBookings);
router.post('/bookings', ctrl.createBooking);
router.put('/bookings/:id', ctrl.updateBooking);
router.delete('/bookings/:id', ctrl.deleteBooking);
router.put('/bookings/:id/approve', ctrl.approveBooking);
router.put('/bookings/:id/reject', ctrl.rejectBooking);

export default router;
