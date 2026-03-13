import { Router } from 'express';
import * as ctrl from '../controllers/signature.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// 전자서명
router.post('/signatures/sign/:noteId',  requirePermission('note:sign'),  ctrl.signNote);
router.get('/signatures/verify/:noteId', requirePermission('note:read'),  ctrl.verifySignature);

// 감사로그
router.get('/audit',                     requirePermission('audit:read'),  ctrl.getAuditLogs);

// 내보내기
router.post('/export/pdf/:noteId',       requirePermission('export:pdf'),  ctrl.exportPdf);
router.get('/export/status/:jobId',      requirePermission('export:pdf'),  ctrl.getExportStatus);
router.post('/export/zip',               requirePermission('export:pdf'),  ctrl.exportZip);

export default router;
