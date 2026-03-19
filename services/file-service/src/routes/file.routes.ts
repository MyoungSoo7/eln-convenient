import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/file.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
import { validate, Permission } from '@lab/shared';
import { PresignedUploadQuerySchema } from '../dtos/file.dto';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = Router();

router.use(requireAuth);

// ── 업로드 ─────────────────────────────────────────────────
router.post('/',
  requirePermission(Permission.FILE_UPLOAD),
  upload.single('file'),
  ctrl.uploadFile,
);
// presigned PUT URL (클라이언트 → MinIO 직접 업로드)
router.get('/presigned-upload',
  requirePermission(Permission.FILE_UPLOAD),
  validate({ query: PresignedUploadQuerySchema }),
  ctrl.getPresignedUpload,
);

// ── 다운로드 ───────────────────────────────────────────────
router.get('/:id',         requirePermission(Permission.FILE_READ),   ctrl.downloadFile);   // presigned URL redirect
router.get('/:id/url',     requirePermission(Permission.FILE_READ),   ctrl.getDownloadUrl); // presigned URL JSON 반환
router.get('/:id/stream',  requirePermission(Permission.FILE_READ),   ctrl.streamFile);     // 서버 경유 스트리밍

// ── 메타 / 삭제 ────────────────────────────────────────────
router.get('/:id/meta',    requirePermission(Permission.FILE_READ),   ctrl.getFileMeta);
router.delete('/:id',      requirePermission(Permission.FILE_DELETE), ctrl.deleteFile);

export default router;
