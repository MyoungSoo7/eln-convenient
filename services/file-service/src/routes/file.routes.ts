import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/file.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
const router = Router();

router.use(requireAuth);

router.post('/',           requirePermission('file:upload'), upload.single('file'), ctrl.uploadFile);
router.get('/:id',         requirePermission('file:read'),   ctrl.downloadFile);
router.get('/:id/stream',  requirePermission('file:read'),   ctrl.streamFile);
router.delete('/:id',      requirePermission('file:delete'), ctrl.deleteFile);
router.get('/:id/meta',    requirePermission('file:read'),   ctrl.getFileMeta);

export default router;
