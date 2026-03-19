import { Router } from 'express';
import * as ctrl from '../controllers/template.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
import { validate, Permission } from '@lab/shared';
import { CreateTemplateSchema, UpdateTemplateSchema } from '../dtos/note.dto';

const router = Router();

router.use(requireAuth);

router.get('/',               requirePermission(Permission.TEMPLATE_READ),   ctrl.listTemplates);
router.post('/',              requirePermission(Permission.TEMPLATE_WRITE),  validate({ body: CreateTemplateSchema }), ctrl.createTemplate);
router.post('/recommend',     requirePermission(Permission.TEMPLATE_READ),   ctrl.recommendTemplates);
router.get('/:id',            requirePermission(Permission.TEMPLATE_READ),   ctrl.getTemplate);
router.put('/:id',            requirePermission(Permission.TEMPLATE_WRITE),  validate({ body: UpdateTemplateSchema }), ctrl.updateTemplate);
router.delete('/:id',         requirePermission(Permission.TEMPLATE_WRITE),  ctrl.deleteTemplate);
// (3) 템플릿 복사
router.post('/:id/copy',      requirePermission(Permission.TEMPLATE_WRITE),  ctrl.copyTemplate);

export default router;
