import { Router } from 'express';
import * as ctrl from '../controllers/export.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/list',            requirePermission('export:pdf'), ctrl.listExportJobs);
router.post('/pdf/:noteId',    requirePermission('export:pdf'), ctrl.exportPdf);
router.post('/zip',            requirePermission('export:pdf'), ctrl.exportZip);
router.get('/status/:jobId',   requirePermission('export:pdf'), ctrl.getExportStatus);

export default router;
