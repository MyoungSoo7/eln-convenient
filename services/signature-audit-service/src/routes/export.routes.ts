import { Router } from 'express';
import * as ctrl from '../controllers/export.controller';

const router = Router();

router.post('/pdf/:noteId', ctrl.exportPdf);
router.get('/status/:jobId', ctrl.getExportStatus);
router.post('/zip', ctrl.exportZip);

export default router;
