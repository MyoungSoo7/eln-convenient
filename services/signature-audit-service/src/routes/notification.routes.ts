import { FastifyPluginAsync } from 'fastify';
import { requireAuth, requireInternalSecret } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import {
  ListNotificationsQuerySchema,
  NotificationIdParamsSchema,
  CreateNotificationInternalSchema,
} from '../dtos/signature.dto';
import * as ctrl from '../controllers/notification.controller';

const notificationRoutes: FastifyPluginAsync = async (app) => {
  // 내부 전용 — requireInternalSecret으로 보호
  app.post('/internal', { preHandler: [requireInternalSecret, validate({ body: CreateNotificationInternalSchema })] }, ctrl.createNotificationInternal);

  // 이하 모든 라우트: 로그인 필요
  app.register(async (authed) => {
    authed.addHook('onRequest', requireAuth);

    // read-all 은 /:id/read 보다 먼저 등록
    authed.get('/unread-count', ctrl.getUnreadCount);
    authed.patch('/read-all', ctrl.markAllAsRead);
    authed.patch('/:id/read', { preHandler: [validate({ params: NotificationIdParamsSchema })] }, ctrl.markAsRead);
    authed.get('/', { preHandler: [validate({ query: ListNotificationsQuerySchema })] }, ctrl.listNotifications);
  });
};

export default notificationRoutes;
