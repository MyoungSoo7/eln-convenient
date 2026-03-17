import { Router } from 'express';
import * as ctrl from '../controllers/audit.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

// 내부 전용 — requireAuth 미들웨어 적용 안 함
router.post('/internal', ctrl.createAuditLogInternal);

router.use(requireAuth);

// actions는 /:id 보다 먼저 등록
router.get('/actions', requirePermission('audit:read'), ctrl.listAuditActions);
router.get('/',        requirePermission('audit:read'), ctrl.listAuditLogs);
router.get('/:id',     requirePermission('audit:read'), ctrl.getAuditLog);

export default router;
