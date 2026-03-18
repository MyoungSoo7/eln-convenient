// services/file-service/src/routes/export.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/export.controller';

const router = Router();
router.use(requireAuth);

router.post('/pdf',            ctrl.createPdfExport);
router.post('/zip',            ctrl.createZipExport);
router.get('/',                ctrl.listExports);
router.get('/:jobId',          ctrl.getExport);
router.get('/:jobId/download', ctrl.downloadExport);
router.delete('/:jobId',       ctrl.cancelExport);

export default router;
