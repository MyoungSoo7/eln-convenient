import { Router } from 'express';
import * as ctrl from '../controllers/code.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { RoleName } from '@lab/shared';

const router = Router();

router.use(requireAuth);

// 모든 인증 사용자: 코드 조회
router.get('/', ctrl.listCodes);

// admin 전용: 코드 관리
router.get('/groups', requireRole(RoleName.ADMIN), ctrl.listGroups);
router.post('/', requireRole(RoleName.ADMIN), ctrl.createCode);
router.put('/:id', requireRole(RoleName.ADMIN), ctrl.updateCode);
router.delete('/:id', requireRole(RoleName.ADMIN), ctrl.deleteCode);

export default router;
