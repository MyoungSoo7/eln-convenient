import { Router } from 'express';
import * as ctrl from '../controllers/note.controller';

const router = Router();

// 노트 CRUD
router.get('/notes', ctrl.getNotes);
router.post('/notes', ctrl.createNote);
router.get('/notes/:id', ctrl.getNoteById);
router.put('/notes/:id', ctrl.updateNote);
router.delete('/notes/:id', ctrl.deleteNote);

// 상태 변경
router.patch('/notes/:id/status', ctrl.changeNoteStatus);

// 관리자 잠금 해제
router.post('/notes/:id/admin-unlock', ctrl.adminUnlockNote);

// 리비전
router.get('/notes/:id/revisions', ctrl.getRevisions);
router.get('/notes/:id/revisions/:rev', ctrl.getRevisionById);

// 첨부파일
router.post('/notes/:id/attachments', ctrl.addAttachment);

// 링크
router.get('/notes/:id/links', ctrl.getNoteLinks);
router.post('/notes/:id/links', ctrl.createNoteLink);

// 템플릿
router.get('/templates', ctrl.getTemplates);
router.post('/templates', ctrl.createTemplate);
router.get('/templates/:id', ctrl.getTemplateById);

export default router;
