import { Router } from 'express';
import * as ctrl from '../controllers/export.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import {
  ExportPdfParamsSchema,
  ExportZipBodySchema,
  ExportReportBodySchema,
  ExportStatusParamsSchema,
} from '../dtos/signature.dto';

const router = Router();

router.use(requireAuth);

router.get('/list',            requirePermission('export:pdf'), ctrl.listExportJobs);
router.post('/pdf/:noteId',    requirePermission('export:pdf'), validate({ params: ExportPdfParamsSchema }), ctrl.exportPdf);
router.post('/zip',            requirePermission('export:pdf'), validate({ body: ExportZipBodySchema }), ctrl.exportZip);
router.post('/report',         requirePermission('export:pdf'), validate({ body: ExportReportBodySchema }), ctrl.exportReport);
router.get('/status/:jobId',   requirePermission('export:pdf'), validate({ params: ExportStatusParamsSchema }), ctrl.getExportStatus);

export default router;
