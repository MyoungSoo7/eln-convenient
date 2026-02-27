import { Router } from 'express';
import * as ctrl from '../controllers/search.controller';

const router = Router();

router.get('/', ctrl.search);
router.get('/suggest', ctrl.suggest);

export default router;
