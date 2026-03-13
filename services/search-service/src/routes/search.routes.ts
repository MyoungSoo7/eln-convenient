import { Router } from 'express';
import * as ctrl from '../controllers/search.controller';

const router = Router();

router.get('/', ctrl.search);
router.get('/suggest', ctrl.suggest);
router.post('/index', ctrl.indexDoc);
router.delete('/index/:type/:id', ctrl.removeDoc);

export default router;
