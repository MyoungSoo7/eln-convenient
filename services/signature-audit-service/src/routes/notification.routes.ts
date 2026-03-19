import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import {
  ListNotificationsQuerySchema,
  NotificationIdParamsSchema,
  CreateNotificationInternalSchema,
} from '../dtos/signature.dto';
import * as ctrl from '../controllers/notification.controller';

const router = Router();

// 내부 전용 — requireAuth 미적용
router.post('/internal', validate({ body: CreateNotificationInternalSchema }), ctrl.createNotificationInternal);

router.use(requireAuth);

// read-all 은 /:id/read 보다 먼저 등록
router.get('/unread-count', ctrl.getUnreadCount);
router.patch('/read-all', ctrl.markAllAsRead);
router.patch('/:id/read', validate({ params: NotificationIdParamsSchema }), ctrl.markAsRead);
router.get('/', validate({ query: ListNotificationsQuerySchema }), ctrl.listNotifications);

export default router;
