import { Router } from 'express';
import * as ctrl from '../controllers/template.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/',            requirePermission('template:read'),  ctrl.listTemplates);
router.post('/',           requirePermission('template:write'), ctrl.createTemplate);
router.get('/:id',         requirePermission('template:read'),  ctrl.getTemplate);
router.post('/recommend',  requirePermission('template:read'),  ctrl.recommendTemplates);

export default router;