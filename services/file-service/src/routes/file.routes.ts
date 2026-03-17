import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/file.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = Router();

router.use(requireAuth);

// ── 업로드 ─────────────────────────────────────────────────
router.post('/',
  requirePermission('file:upload'),
  upload.single('file'),
  ctrl.uploadFile,
);
// presigned PUT URL (클라이언트 → MinIO 직접 업로드)
router.get('/presigned-upload',
  requirePermission('file:upload'),
  ctrl.getPresignedUpload,
);

// ── 다운로드 ───────────────────────────────────────────────
router.get('/:id',         requirePermission('file:read'),   ctrl.downloadFile);   // presigned URL redirect
router.get('/:id/url',     requirePermission('file:read'),   ctrl.getDownloadUrl); // presigned URL JSON 반환
router.get('/:id/stream',  requirePermission('file:read'),   ctrl.streamFile);     // 서버 경유 스트리밍

// ── 메타 / 삭제 ────────────────────────────────────────────
router.get('/:id/meta',    requirePermission('file:read'),   ctrl.getFileMeta);
router.delete('/:id',      requirePermission('file:delete'), ctrl.deleteFile);

export default router;
