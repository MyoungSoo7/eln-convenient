import { Router } from 'express';
import * as ctrl from '../controllers/signature.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate, Permission, RoleName } from '@lab/shared';
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
router.get('/signatures/compliance/stats',       requirePermission(Permission.NOTE_READ),  ctrl.getComplianceStats);
router.get('/signatures/compliance/list',        requirePermission(Permission.NOTE_READ),  validate({ query: ComplianceListQuerySchema }), ctrl.getComplianceList);
router.get('/signatures/editable/:noteId',       requirePermission(Permission.NOTE_READ),  validate({ params: NoteIdParamsSchema }), ctrl.getNoteEditable);

// 전자서명
router.post('/signatures/sign/:noteId',          requirePermission(Permission.NOTE_SIGN),  validate({ params: SignNoteParamsSchema, body: SignNoteBodySchema }), ctrl.signNote);
router.get('/signatures/verify/:noteId',         requirePermission(Permission.NOTE_READ),  validate({ params: NoteIdParamsSchema }), ctrl.verifySignature);
router.post('/signatures/revoke/:signatureId',   requireRole(RoleName.ADMIN),            validate({ params: RevokeSignatureParamsSchema, body: RevokeSignatureBodySchema }), ctrl.revokeSignature);
router.get('/signatures/:noteId',                requirePermission(Permission.NOTE_READ),  validate({ params: NoteIdParamsSchema }), ctrl.listSignatures);

export default router;
