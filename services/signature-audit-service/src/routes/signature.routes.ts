import { Router } from 'express';
import * as ctrl from '../controllers/signature.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// 컴플라이언스 API — 반드시 :noteId 라우트 앞에 등록
router.get('/signatures/compliance/stats',       requirePermission('note:read'),  ctrl.getComplianceStats);
router.get('/signatures/compliance/list',        requirePermission('note:read'),  ctrl.getComplianceList);
router.get('/signatures/editable/:noteId',       requirePermission('note:read'),  ctrl.getNoteEditable);

// 전자서명
router.post('/signatures/sign/:noteId',          requirePermission('note:sign'),  ctrl.signNote);
router.get('/signatures/verify/:noteId',         requirePermission('note:read'),  ctrl.verifySignature);
router.post('/signatures/revoke/:signatureId',   requireRole('admin'),            ctrl.revokeSignature);
router.get('/signatures/:noteId',                requirePermission('note:read'),  ctrl.listSignatures);

export default router;
