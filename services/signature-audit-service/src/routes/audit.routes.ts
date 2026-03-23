import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/audit.controller';
import { requireAuth, requirePermission, requireInternalSecret } from '../middlewares/auth.middleware';
import { validate, Permission } from '@lab/shared';
import {
  CreateAuditLogInternalSchema,
  ListAuditLogsQuerySchema,
  AuditIdParamsSchema,
} from '../dtos/signature.dto';

const auditRoutes: FastifyPluginAsync = async (app) => {
  // 내부 전용 — requireInternalSecret으로 보호
  app.post('/internal', { preHandler: [requireInternalSecret, validate({ body: CreateAuditLogInternalSchema })] }, ctrl.createAuditLogInternal);

  // 이하 모든 라우트: 로그인 필요
  app.register(async (authed) => {
    authed.addHook('onRequest', requireAuth);

    // actions는 /:id 보다 먼저 등록
    authed.get('/actions', { preHandler: [requirePermission(Permission.AUDIT_READ)] }, ctrl.listAuditActions);
    authed.get('/', { preHandler: [requirePermission(Permission.AUDIT_READ), validate({ query: ListAuditLogsQuerySchema })] }, ctrl.listAuditLogs);
    authed.get('/:id', { preHandler: [requirePermission(Permission.AUDIT_READ), validate({ params: AuditIdParamsSchema })] }, ctrl.getAuditLog);
  });
};

export default auditRoutes;
