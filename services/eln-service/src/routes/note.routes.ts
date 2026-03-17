import { Router } from 'express';
import * as ctrl from '../controllers/note.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// ─── 태그 목록 ────────────────────────────────────────────────
router.get('/tags',                              requirePermission('note:read'),    ctrl.getTags);

// ─── 연구노트 CRUD ──────────────────────────────────────────
router.get('/notes',                             requirePermission('note:read'),    ctrl.getNotes);
router.post('/notes',                            requirePermission('note:write'),   ctrl.createNote);
router.get('/notes/:id',                         requirePermission('note:read'),    ctrl.getNoteById);
router.put('/notes/:id',                         requirePermission('note:write'),   ctrl.updateNote);
router.delete('/notes/:id',                      requirePermission('note:delete'),  ctrl.deleteNote);

// ─── 상태 관리 ────────────────────────────────────────────────
router.patch('/notes/:id/status',                requirePermission('note:write'),   ctrl.changeNoteStatus);
router.post('/notes/:id/admin-unlock',           requirePermission('note:unlock'),  ctrl.adminUnlockNote);

// ─── 버전 관리 (리비전) ─────────────────────────────────────
router.get('/notes/:id/revisions',               requirePermission('note:read'),    ctrl.getRevisions);
router.get('/notes/:id/revisions/:rev',          requirePermission('note:read'),    ctrl.getRevisionById);

// ─── 첨부파일 ────────────────────────────────────────────────
router.post('/notes/:id/attachments',            requirePermission('file:upload'),  ctrl.addAttachment);
router.delete('/notes/:id/attachments/:attachmentId', requirePermission('file:delete'), ctrl.deleteAttachment);

// ─── 링크 (교차 참조) ────────────────────────────────────────
router.get('/notes/:id/links',                   requirePermission('note:read'),    ctrl.getNoteLinks);
router.post('/notes/:id/links',                  requirePermission('note:write'),   ctrl.createNoteLink);
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

// ─── 템플릿 (note.routes 내 /api/templates) ──────────────────
router.get('/templates',         requirePermission('template:read'),   ctrl.getTemplates);
router.post('/templates',        requirePermission('template:write'),  ctrl.createTemplate);
router.get('/templates/:id',     requirePermission('template:read'),   ctrl.getTemplateById);

export default router;
