import { Router } from 'express';
import * as ctrl from '../controllers/template.controller';

const router = Router();

router.get('/', ctrl.listTemplates);
router.post('/', ctrl.createTemplate);
router.get('/:id', ctrl.getTemplate);
router.post('/recommend', ctrl.recommendTemplates);

export default router;