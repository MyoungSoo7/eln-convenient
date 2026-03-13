import { Router } from 'express';
import * as ctrl from '../controllers/note.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// 노트 CRUD
router.get('/notes',                     requirePermission('note:read'),    ctrl.getNotes);
router.post('/notes',                    requirePermission('note:write'),   ctrl.createNote);
router.get('/notes/:id',                 requirePermission('note:read'),    ctrl.getNoteById);
router.put('/notes/:id',                 requirePermission('note:write'),   ctrl.updateNote);
router.delete('/notes/:id',              requirePermission('note:delete'),  ctrl.deleteNote);

// 상태 변경
router.patch('/notes/:id/status',        requirePermission('note:write'),   ctrl.changeNoteStatus);

// 관리자 잠금 해제
router.post('/notes/:id/admin-unlock',   requirePermission('note:unlock'),  ctrl.adminUnlockNote);

// 리비전
router.get('/notes/:id/revisions',       requirePermission('note:read'),    ctrl.getRevisions);
router.get('/notes/:id/revisions/:rev',  requirePermission('note:read'),    ctrl.getRevisionById);

// 첨부파일
router.post('/notes/:id/attachments',    requirePermission('file:upload'),  ctrl.addAttachment);

// 링크
router.get('/notes/:id/links',           requirePermission('note:read'),    ctrl.getNoteLinks);
router.post('/notes/:id/links',          requirePermission('note:write'),   ctrl.createNoteLink);

// 템플릿
router.get('/templates',                 requirePermission('template:read'),   ctrl.getTemplates);
router.post('/templates',                requirePermission('template:write'),  ctrl.createTemplate);
router.get('/templates/:id',             requirePermission('template:read'),   ctrl.getTemplateById);

export default router;
