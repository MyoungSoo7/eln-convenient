import { Router } from 'express';
import * as ctrl from '../controllers/export.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
import { validate, Permission } from '@lab/shared';
import {
  ExportPdfParamsSchema,
  ExportZipBodySchema,
  ExportReportBodySchema,
  ExportStatusParamsSchema,
} from '../dtos/signature.dto';

const router = Router();

router.use(requireAuth);

router.get('/list',            requirePermission(Permission.EXPORT_PDF), ctrl.listExportJobs);
router.post('/pdf/:noteId',    requirePermission(Permission.EXPORT_PDF), validate({ params: ExportPdfParamsSchema }), ctrl.exportPdf);
router.post('/zip',            requirePermission(Permission.EXPORT_PDF), validate({ body: ExportZipBodySchema }), ctrl.exportZip);
router.post('/report',         requirePermission(Permission.EXPORT_PDF), validate({ body: ExportReportBodySchema }), ctrl.exportReport);
router.get('/status/:jobId',   requirePermission(Permission.EXPORT_PDF), validate({ params: ExportStatusParamsSchema }), ctrl.getExportStatus);

export default router;
