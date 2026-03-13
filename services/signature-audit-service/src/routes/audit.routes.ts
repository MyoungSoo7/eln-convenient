import { Router } from 'express';
import * as ctrl from '../controllers/audit.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/',    requirePermission('audit:read'), ctrl.listAuditLogs);
router.get('/:id', requirePermission('audit:read'), ctrl.getAuditLog);

export default router;
