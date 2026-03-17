import { Router } from 'express';
import * as ctrl from '../controllers/template.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/',               requirePermission('template:read'),   ctrl.listTemplates);
router.post('/',              requirePermission('template:write'),  ctrl.createTemplate);
router.post('/recommend',     requirePermission('template:read'),   ctrl.recommendTemplates);
router.get('/:id',            requirePermission('template:read'),   ctrl.getTemplate);
router.put('/:id',            requirePermission('template:write'),  ctrl.updateTemplate);
router.delete('/:id',         requirePermission('template:write'),  ctrl.deleteTemplate);
// (3) 템플릿 복사
router.post('/:id/copy',      requirePermission('template:write'),  ctrl.copyTemplate);

export default router;
