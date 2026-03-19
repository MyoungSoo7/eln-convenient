import { Router } from 'express';
import * as ctrl from '../controllers/audit.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import {
  CreateAuditLogInternalSchema,
  ListAuditLogsQuerySchema,
  AuditIdParamsSchema,
} from '../dtos/signature.dto';

const router = Router();

// 내부 전용 — requireAuth 미들웨어 적용 안 함
router.post('/internal', validate({ body: CreateAuditLogInternalSchema }), ctrl.createAuditLogInternal);

router.use(requireAuth);

// actions는 /:id 보다 먼저 등록
router.get('/actions', requirePermission('audit:read'), ctrl.listAuditActions);
router.get('/',        requirePermission('audit:read'), validate({ query: ListAuditLogsQuerySchema }), ctrl.listAuditLogs);
router.get('/:id',     requirePermission('audit:read'), validate({ params: AuditIdParamsSchema }), ctrl.getAuditLog);

export default router;
