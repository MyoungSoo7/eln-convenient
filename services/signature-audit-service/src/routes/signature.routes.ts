import { Router } from 'express';
import * as ctrl from '../controllers/signature.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import {
  SignNoteParamsSchema,
  SignNoteBodySchema,
  RevokeSignatureParamsSchema,
  RevokeSignatureBodySchema,
  NoteIdParamsSchema,
  ComplianceListQuerySchema,
} from '../dtos/signature.dto';

const router = Router();

router.use(requireAuth);

// 컴플라이언스 API — 반드시 :noteId 라우트 앞에 등록
router.get('/signatures/compliance/stats',       requirePermission('note:read'),  ctrl.getComplianceStats);
router.get('/signatures/compliance/list',        requirePermission('note:read'),  validate({ query: ComplianceListQuerySchema }), ctrl.getComplianceList);
router.get('/signatures/editable/:noteId',       requirePermission('note:read'),  validate({ params: NoteIdParamsSchema }), ctrl.getNoteEditable);

// 전자서명
router.post('/signatures/sign/:noteId',          requirePermission('note:sign'),  validate({ params: SignNoteParamsSchema, body: SignNoteBodySchema }), ctrl.signNote);
router.get('/signatures/verify/:noteId',         requirePermission('note:read'),  validate({ params: NoteIdParamsSchema }), ctrl.verifySignature);
router.post('/signatures/revoke/:signatureId',   requireRole('admin'),            validate({ params: RevokeSignatureParamsSchema, body: RevokeSignatureBodySchema }), ctrl.revokeSignature);
router.get('/signatures/:noteId',                requirePermission('note:read'),  validate({ params: NoteIdParamsSchema }), ctrl.listSignatures);

export default router;
