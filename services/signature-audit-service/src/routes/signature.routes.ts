import { FastifyPluginAsync } from 'fastify';
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

const signatureRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  // 컴플라이언스 API — 반드시 :noteId 라우트 앞에 등록
  app.get('/signatures/compliance/stats', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getComplianceStats);
  app.get('/signatures/compliance/list', { preHandler: [requirePermission(Permission.NOTE_READ), validate({ query: ComplianceListQuerySchema })] }, ctrl.getComplianceList);
  app.get('/signatures/editable/:noteId', { preHandler: [requirePermission(Permission.NOTE_READ), validate({ params: NoteIdParamsSchema })] }, ctrl.getNoteEditable);

  // 전자서명
  app.post('/signatures/sign/:noteId', { preHandler: [requirePermission(Permission.NOTE_SIGN), validate({ params: SignNoteParamsSchema, body: SignNoteBodySchema })] }, ctrl.signNote);
  app.get('/signatures/verify/:noteId', { preHandler: [requirePermission(Permission.NOTE_READ), validate({ params: NoteIdParamsSchema })] }, ctrl.verifySignature);
  app.post('/signatures/revoke/:signatureId', { preHandler: [requireRole(RoleName.ADMIN), validate({ params: RevokeSignatureParamsSchema, body: RevokeSignatureBodySchema })] }, ctrl.revokeSignature);
  app.get('/signatures/:noteId', { preHandler: [requirePermission(Permission.NOTE_READ), validate({ params: NoteIdParamsSchema })] }, ctrl.listSignatures);
};

export default signatureRoutes;
