import { Router } from 'express';
import * as ctrl from '../controllers/audit.controller';
import { requireAuth, requirePermission, requireInternalSecret } from '../middlewares/auth.middleware';
import { validate, Permission } from '@lab/shared';
import {
  CreateAuditLogInternalSchema,
  ListAuditLogsQuerySchema,
  AuditIdParamsSchema,
} from '../dtos/signature.dto';

const router = Router();

// 내부 전용 — requireInternalSecret으로 보호
router.post('/internal', requireInternalSecret, validate({ body: CreateAuditLogInternalSchema }), ctrl.createAuditLogInternal);

router.use(requireAuth);

// actions는 /:id 보다 먼저 등록
router.get('/actions', requirePermission(Permission.AUDIT_READ), ctrl.listAuditActions);
router.get('/',        requirePermission(Permission.AUDIT_READ), validate({ query: ListAuditLogsQuerySchema }), ctrl.listAuditLogs);
router.get('/:id',     requirePermission(Permission.AUDIT_READ), validate({ params: AuditIdParamsSchema }), ctrl.getAuditLog);

export default router;
