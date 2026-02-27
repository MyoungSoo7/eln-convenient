import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/file.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
const router = Router();

router.post('/', upload.single('file'), ctrl.uploadFile);
router.get('/:id', ctrl.downloadFile);
router.delete('/:id', ctrl.deleteFile);
router.get('/:id/meta', ctrl.getFileMeta);

export default router;
