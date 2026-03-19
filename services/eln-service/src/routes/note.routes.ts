import { Router } from 'express';
import * as ctrl from '../controllers/note.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate, Permission, RoleName } from '@lab/shared';
import {
  CreateNoteSchema, UpdateNoteSchema, ChangeStatusSchema, AdminUnlockSchema,
  AddLinkSchema, NoteIdParamsSchema, NotesBatchBodySchema, NoteStatsQuerySchema,
  GetTagsQuerySchema,
} from '../dtos/note.dto';

const router = Router();

router.use(requireAuth);

// ─── 태그 목록 ────────────────────────────────────────────────
router.get('/tags',                              requirePermission(Permission.NOTE_READ),    validate({ query: GetTagsQuerySchema }), ctrl.getTags);

// ─── 연구노트 CRUD ──────────────────────────────────────────
router.get('/notes',                             requirePermission(Permission.NOTE_READ),    ctrl.getNotes);
router.post('/notes',                            requirePermission(Permission.NOTE_WRITE),   validate({ body: CreateNoteSchema }), ctrl.createNote);
// ─── N+1 최적화: GET /notes/stats는 반드시 /notes/:id 앞에 위치해야 한다.
// Express는 등록 순서대로 매칭하므로 /notes/:id가 먼저 있으면 'stats'가 id=stats로 처리된다.
// POST /notes/batch는 메서드가 달라 충돌이 없지만 관련 라우트로서 함께 배치한다.
router.get('/notes/stats',  requirePermission(Permission.NOTE_READ),  validate({ query: NoteStatsQuerySchema }), ctrl.getNoteStats);
router.post('/notes/batch', requirePermission(Permission.NOTE_READ),  validate({ body: NotesBatchBodySchema }), ctrl.getNotesBatch);
router.get('/notes/:id',                         requirePermission(Permission.NOTE_READ),    ctrl.getNoteById);
router.put('/notes/:id',                         requirePermission(Permission.NOTE_WRITE),   validate({ body: UpdateNoteSchema }), ctrl.updateNote);
router.delete('/notes/:id',                      requirePermission(Permission.NOTE_DELETE),  ctrl.deleteNote);

// ─── 상태 관리 ────────────────────────────────────────────────
router.patch('/notes/:id/status',                requirePermission(Permission.NOTE_WRITE),   validate({ body: ChangeStatusSchema }), ctrl.changeNoteStatus);
router.post('/notes/:id/admin-unlock',
  requireRole(RoleName.ADMIN),              // 레이어 1: 역할 게이트
  requirePermission(Permission.NOTE_UNLOCK),  // 레이어 2: 권한 게이트
  validate({ body: AdminUnlockSchema }),
  ctrl.adminUnlockNote,
);

// ─── 버전 관리 (리비전) ─────────────────────────────────────
router.get('/notes/:id/revisions',               requirePermission(Permission.NOTE_READ),    ctrl.getRevisions);
router.get('/notes/:id/revisions/:rev',          requirePermission(Permission.NOTE_READ),    ctrl.getRevisionById);

// ─── 첨부파일 ────────────────────────────────────────────────
router.get('/notes/:id/attachments',             requirePermission(Permission.FILE_READ),    ctrl.getAttachments);
router.post('/notes/:id/attachments',            requirePermission(Permission.FILE_UPLOAD),  ctrl.addAttachment);
router.delete('/notes/:id/attachments/:attachmentId', requirePermission(Permission.FILE_DELETE), ctrl.deleteAttachment);

// ─── 링크 (교차 참조) ────────────────────────────────────────
router.get('/notes/:id/links',                   requirePermission(Permission.NOTE_READ),    ctrl.getNoteLinks);
router.post('/notes/:id/links',                  requirePermission(Permission.NOTE_WRITE),   validate({ body: AddLinkSchema }), ctrl.createNoteLink);
router.delete('/notes/:id/links/:linkId',        requirePermission(Permission.NOTE_WRITE),   ctrl.deleteNoteLink);

// ─── 프로토콜 CRUD (type=protocol 필터) ──────────────────────
// note.controller.ts의 동일 핸들러 재사용, ?type=protocol 쿼리 자동 주입
router.get('/protocols', requirePermission(Permission.NOTE_READ), (req, res) => {
  req.query.type = 'protocol';
  return ctrl.getNotes(req, res);
});
router.post('/protocols', requirePermission(Permission.NOTE_WRITE), (req, res) => {
  req.body.type = 'protocol';
  return ctrl.createNote(req, res);
});
router.get('/protocols/:id',    requirePermission(Permission.NOTE_READ),    ctrl.getNoteById);
router.put('/protocols/:id',    requirePermission(Permission.NOTE_WRITE),   ctrl.updateNote);
router.delete('/protocols/:id', requirePermission(Permission.NOTE_DELETE),  ctrl.deleteNote);
router.patch('/protocols/:id/status',  requirePermission(Permission.NOTE_WRITE),  ctrl.changeNoteStatus);
router.get('/protocols/:id/revisions', requirePermission(Permission.NOTE_READ),   ctrl.getRevisions);
router.get('/protocols/:id/revisions/:rev', requirePermission(Permission.NOTE_READ), ctrl.getRevisionById);

export default router;
