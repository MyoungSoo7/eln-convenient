import { Router } from 'express';
import * as ctrl from '../controllers/export.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/pdf/:noteId',    requirePermission('export:pdf'), ctrl.exportPdf);
router.get('/status/:jobId',   requirePermission('export:pdf'), ctrl.getExportStatus);
router.post('/zip',            requirePermission('export:pdf'), ctrl.exportZip);

export default router;
