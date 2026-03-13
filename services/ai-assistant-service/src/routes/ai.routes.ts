import { Router } from 'express';
import * as ctrl from '../controllers/ai.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/recommend-template',  requirePermission('note:read'),   ctrl.recommendTemplate);
router.post('/draft',               requirePermission('note:write'),  ctrl.generateDraft);
router.post('/index',               requirePermission('audit:read'),  ctrl.indexDocument);  // 서비스 내부 호출용
router.post('/ask',                 requirePermission('note:read'),   ctrl.askQuestion);
router.get('/index/status',         requirePermission('audit:read'),  ctrl.getIndexStatus);

export default router;
