import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import * as ctrl from '../controllers/note.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate, Permission, RoleName, requireOwnerOrAdminFastify, ErrorCode, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';
import {
  CreateNoteSchema, UpdateNoteSchema, ChangeStatusSchema, AdminUnlockSchema,
  AddLinkSchema, NoteIdParamsSchema, NotesBatchBodySchema, NoteStatsQuerySchema,
  GetTagsQuerySchema,
} from '../dtos/note.dto';

const injectTemplateType = async (request: FastifyRequest) => {
  (request.query as any).type = 'template';
};

const injectTemplateBodyType = async (request: FastifyRequest) => {
  (request.body as any).type = 'template';
};

const noteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  // ─── 태그 목록 ────────────────────────────────────────────────
  app.get('/tags', { preHandler: [requirePermission(Permission.NOTE_READ), validate({ query: GetTagsQuerySchema })] }, ctrl.getTags);

  // ─── 연구노트 CRUD ──────────────────────────────────────────
  app.get('/notes', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getNotes);
  app.post('/notes', { preHandler: [requirePermission(Permission.NOTE_WRITE), validate({ body: CreateNoteSchema })] }, ctrl.createNote);
  // ─── N+1 최적화: GET /notes/stats는 반드시 /notes/:id 앞에 위치해야 한다.
  app.get('/notes/stats', { preHandler: [requirePermission(Permission.NOTE_READ), validate({ query: NoteStatsQuerySchema })] }, ctrl.getNoteStats);
  app.post('/notes/batch', { preHandler: [requirePermission(Permission.NOTE_READ), validate({ body: NotesBatchBodySchema })] }, ctrl.getNotesBatch);
  // ─── 관리자 전용: 통합검색 일괄 재색인 ─────────────────
  // /notes/:id 보다 앞에 등록해야 Fastify가 정적 경로로 매칭한다
  app.post('/notes/admin/reindex', {
    preHandler: [requireRole(RoleName.ADMIN)],
  }, ctrl.adminReindexAll);
  app.get('/notes/:id', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getNoteById);
  app.put('/notes/:id', { preHandler: [requirePermission(Permission.NOTE_WRITE), validate({ body: UpdateNoteSchema })] }, ctrl.updateNote);
  app.delete('/notes/:id', { preHandler: [requirePermission(Permission.NOTE_DELETE)] }, ctrl.deleteNote);

  // ─── 상태 관리 ────────────────────────────────────────────────
  app.patch('/notes/:id/status', { preHandler: [requirePermission(Permission.NOTE_STATUS), validate({ body: ChangeStatusSchema })] }, ctrl.changeNoteStatus);
  app.post('/notes/:id/admin-unlock', {
    preHandler: [
      requireRole(RoleName.ADMIN),              // 레이어 1: 역할 게이트
      requirePermission(Permission.NOTE_UNLOCK),  // 레이어 2: 권한 게이트
      validate({ body: AdminUnlockSchema }),
    ],
  }, ctrl.adminUnlockNote);

  // ─── 버전 관리 (리비전) ─────────────────────────────────────
  app.get('/notes/:id/revisions', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getRevisions);
  app.get('/notes/:id/revisions/:rev', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getRevisionById);

  // ─── 첨부파일 ────────────────────────────────────────────────
  app.get('/notes/:id/attachments', { preHandler: [requirePermission(Permission.FILE_READ)] }, ctrl.getAttachments);
  app.post('/notes/:id/attachments', { preHandler: [requirePermission(Permission.FILE_UPLOAD)] }, ctrl.addAttachment);
  app.delete('/notes/:id/attachments/:attachmentId', {
    preHandler: [
      requirePermission(Permission.FILE_DELETE),
      requireOwnerOrAdminFastify(
        async (req) => {
          const note = await prisma.note.findFirst({ where: { id: (req as any).params.id, orgId: getOrgId(req.headers) } });
          if (!note) return null;
          return prisma.attachment.findFirst({ where: { id: (req as any).params.attachmentId, noteId: note.id } });
        },
        'uploadedBy',
        ErrorCode.ATTACHMENT_PERMISSION_DENIED,
      ),
    ],
  }, ctrl.deleteAttachment);

  // ─── 링크 (교차 참조) ────────────────────────────────────────
  app.get('/notes/:id/links', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getNoteLinks);
  app.post('/notes/:id/links', { preHandler: [requirePermission(Permission.NOTE_WRITE), validate({ body: AddLinkSchema })] }, ctrl.createNoteLink);
  app.delete('/notes/:id/links/:linkId', { preHandler: [requirePermission(Permission.NOTE_WRITE)] }, ctrl.deleteNoteLink);

  // ─── 템플릿 CRUD (type=template 필터) ──────────────────────
  // note.controller.ts의 동일 핸들러 재사용, ?type=template 쿼리 자동 주입
  app.get('/protocols', { preHandler: [requirePermission(Permission.NOTE_READ), injectTemplateType] }, ctrl.getNotes);
  app.post('/protocols', { preHandler: [requirePermission(Permission.NOTE_WRITE), injectTemplateBodyType] }, ctrl.createNote);
  app.get('/protocols/:id', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getNoteById);
  app.put('/protocols/:id', { preHandler: [requirePermission(Permission.NOTE_WRITE), validate({ body: UpdateNoteSchema })] }, ctrl.updateNote);
  app.delete('/protocols/:id', { preHandler: [requirePermission(Permission.NOTE_DELETE)] }, ctrl.deleteNote);
  app.patch('/protocols/:id/status', { preHandler: [requirePermission(Permission.NOTE_STATUS)] }, ctrl.changeNoteStatus);
  app.get('/protocols/:id/revisions', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getRevisions);
  app.get('/protocols/:id/revisions/:rev', { preHandler: [requirePermission(Permission.NOTE_READ)] }, ctrl.getRevisionById);
};

export default noteRoutes;
