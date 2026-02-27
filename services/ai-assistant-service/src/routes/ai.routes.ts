import { Router } from 'express';
import * as ctrl from '../controllers/ai.controller';

const router = Router();

router.post('/recommend-template', ctrl.recommendTemplate);
router.post('/draft', ctrl.generateDraft);
router.post('/index', ctrl.indexDocument);
router.post('/ask', ctrl.askQuestion);
router.get('/index/status', ctrl.getIndexStatus);

export default router;
