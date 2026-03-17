import { Router } from 'express';
import * as ctrl from '../controllers/signature.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// 전자서명 (verify, revoke는 :noteId 앞에 등록해야 라우트 충돌 방지)
router.post('/signatures/sign/:noteId',          requirePermission('note:sign'),  ctrl.signNote);
router.get('/signatures/verify/:noteId',         requirePermission('note:read'),  ctrl.verifySignature);
router.post('/signatures/revoke/:signatureId',   requireRole('admin'),            ctrl.revokeSignature);
router.get('/signatures/:noteId',                requirePermission('note:read'),  ctrl.listSignatures);

export default router;
