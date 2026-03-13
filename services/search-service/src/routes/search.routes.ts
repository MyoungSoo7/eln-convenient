import { Router } from 'express';
import * as ctrl from '../controllers/search.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/',                      requirePermission('note:read'),   ctrl.search);
router.get('/suggest',               requirePermission('note:read'),   ctrl.suggest);
router.post('/index',                requirePermission('audit:read'),  ctrl.indexDoc);   // 서비스 내부 호출용
router.delete('/index/:type/:id',    requirePermission('audit:read'),  ctrl.removeDoc);

export default router;
