import { Router } from 'express';
import * as ctrl from '../controllers/note.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import {
  CreateNoteSchema, UpdateNoteSchema, ChangeStatusSchema, AdminUnlockSchema,
  AddLinkSchema, NoteIdParamsSchema, NotesBatchBodySchema, NoteStatsQuerySchema,
  GetTagsQuerySchema,
} from '../dtos/note.dto';

const router = Router();

router.use(requireAuth);

// ─── 태그 목록 ────────────────────────────────────────────────
router.get('/tags',                              requirePermission('note:read'),    validate({ query: GetTagsQuerySchema }), ctrl.getTags);

// ─── 연구노트 CRUD ──────────────────────────────────────────
router.get('/notes',                             requirePermission('note:read'),    ctrl.getNotes);
router.post('/notes',                            requirePermission('note:write'),   validate({ body: CreateNoteSchema }), ctrl.createNote);
// ─── N+1 최적화: GET /notes/stats는 반드시 /notes/:id 앞에 위치해야 한다.
// Express는 등록 순서대로 매칭하므로 /notes/:id가 먼저 있으면 'stats'가 id=stats로 처리된다.
// POST /notes/batch는 메서드가 달라 충돌이 없지만 관련 라우트로서 함께 배치한다.
router.get('/notes/stats',  requirePermission('note:read'),  validate({ query: NoteStatsQuerySchema }), ctrl.getNoteStats);
router.post('/notes/batch', requirePermission('note:read'),  validate({ body: NotesBatchBodySchema }), ctrl.getNotesBatch);
router.get('/notes/:id',                         requirePermission('note:read'),    ctrl.getNoteById);
router.put('/notes/:id',                         requirePermission('note:write'),   validate({ body: UpdateNoteSchema }), ctrl.updateNote);
router.delete('/notes/:id',                      requirePermission('note:delete'),  ctrl.deleteNote);

// ─── 상태 관리 ────────────────────────────────────────────────
router.patch('/notes/:id/status',                requirePermission('note:write'),   validate({ body: ChangeStatusSchema }), ctrl.changeNoteStatus);
router.post('/notes/:id/admin-unlock',
  requireRole('admin'),              // 레이어 1: 역할 게이트
  requirePermission('note:unlock'),  // 레이어 2: 권한 게이트
  validate({ body: AdminUnlockSchema }),
  ctrl.adminUnlockNote,
);

// ─── 버전 관리 (리비전) ─────────────────────────────────────
router.get('/notes/:id/revisions',               requirePermission('note:read'),    ctrl.getRevisions);
router.get('/notes/:id/revisions/:rev',          requirePermission('note:read'),    ctrl.getRevisionById);

// ─── 첨부파일 ────────────────────────────────────────────────
router.get('/notes/:id/attachments',             requirePermission('file:read'),    ctrl.getAttachments);
router.post('/notes/:id/attachments',            requirePermission('file:upload'),  ctrl.addAttachment);
router.delete('/notes/:id/attachments/:attachmentId', requirePermission('file:delete'), ctrl.deleteAttachment);

// ─── 링크 (교차 참조) ────────────────────────────────────────
router.get('/notes/:id/links',                   requirePermission('note:read'),    ctrl.getNoteLinks);
router.post('/notes/:id/links',                  requirePermission('note:write'),   validate({ body: AddLinkSchema }), ctrl.createNoteLink);
router.delete('/notes/:id/links/:linkId',        requirePermission('note:write'),   ctrl.deleteNoteLink);

// ─── 프로토콜 CRUD (type=protocol 필터) ──────────────────────
// note.controller.ts의 동일 핸들러 재사용, ?type=protocol 쿼리 자동 주입
router.get('/protocols', requirePermission('note:read'), (req, res) => {
  req.query.type = 'protocol';
  return ctrl.getNotes(req, res);
});
router.post('/protocols', requirePermission('note:write'), (req, res) => {
  req.body.type = 'protocol';
  return ctrl.createNote(req, res);
});
router.get('/protocols/:id',    requirePermission('note:read'),    ctrl.getNoteById);
router.put('/protocols/:id',    requirePermission('note:write'),   ctrl.updateNote);
router.delete('/protocols/:id', requirePermission('note:delete'),  ctrl.deleteNote);
router.patch('/protocols/:id/status',  requirePermission('note:write'),  ctrl.changeNoteStatus);
router.get('/protocols/:id/revisions', requirePermission('note:read'),   ctrl.getRevisions);
router.get('/protocols/:id/revisions/:rev', requirePermission('note:read'), ctrl.getRevisionById);

export default router;
