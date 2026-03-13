import { Router } from 'express';
import * as ctrl from '../controllers/audit.controller';

const router = Router();

router.get('/', ctrl.listAuditLogs);
router.get('/:id', ctrl.getAuditLog);

export default router;
