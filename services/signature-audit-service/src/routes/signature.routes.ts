import { Router } from 'express';
import * as ctrl from '../controllers/signature.controller';

const router = Router();

// 전자서명
router.post('/signatures/sign/:noteId', ctrl.signNote);
router.get('/signatures/verify/:noteId', ctrl.verifySignature);

// 감사로그
router.get('/audit', ctrl.getAuditLogs);

// 내보내기
router.post('/export/pdf/:noteId', ctrl.exportPdf);
router.get('/export/status/:jobId', ctrl.getExportStatus);
router.post('/export/zip', ctrl.exportZip);

export default router;
