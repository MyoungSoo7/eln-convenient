// services/file-service/src/routes/export.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import { ListExportsQuerySchema, JobIdParamsSchema } from '../dtos/file.dto';
import * as ctrl from '../controllers/export.controller';

const router = Router();
router.use(requireAuth);

router.post('/',               ctrl.createExport);
router.get('/',                validate({ query: ListExportsQuerySchema }), ctrl.listExports);
router.get('/:jobId',          validate({ params: JobIdParamsSchema }), ctrl.getExport);
router.get('/:jobId/download', validate({ params: JobIdParamsSchema }), ctrl.downloadExport);
router.delete('/:jobId',       validate({ params: JobIdParamsSchema }), ctrl.cancelExport);

export default router;
