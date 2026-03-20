// services/file-service/src/routes/export.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireInternalSecret } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import { ListExportsQuerySchema, JobIdParamsSchema } from '../dtos/file.dto';
import * as ctrl from '../controllers/export.controller';

const internalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB (ZIP 파일 대비)
});

const router = Router();

// ── 내부 서비스 전용 (인증: x-internal-secret) ──
router.post('/internal/upload',               requireInternalSecret, internalUpload.single('file'), ctrl.internalUploadExport);
router.get('/internal/presigned/:fileId',     requireInternalSecret, ctrl.internalPresignedUrl);

// ── 사용자 API (인증: JWT/x-user-id) ──
router.use(requireAuth);

router.post('/',               ctrl.createExport);
router.get('/',                validate({ query: ListExportsQuerySchema }), ctrl.listExports);
router.get('/:jobId',          validate({ params: JobIdParamsSchema }), ctrl.getExport);
router.get('/:jobId/download', validate({ params: JobIdParamsSchema }), ctrl.downloadExport);
router.delete('/:jobId',       validate({ params: JobIdParamsSchema }), ctrl.cancelExport);

export default router;
