import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/file.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
import { validate, Permission, requireOwnerOrAdminFastify, ErrorCode, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';
import { PresignedUploadQuerySchema } from '../dtos/file.dto';

const fileRoutes: FastifyPluginAsync = async (app) => {
  // 모든 라우트에 인증 필수
  app.addHook('onRequest', requireAuth);

  // ── 업로드 ─────────────────────────────────────────────────
  app.post('/', {
    preHandler: [requirePermission(Permission.FILE_UPLOAD)],
  }, ctrl.uploadFile);

  // presigned PUT URL (클라이언트 → MinIO 직접 업로드)
  app.get('/presigned-upload', {
    preHandler: [requirePermission(Permission.FILE_UPLOAD), validate({ query: PresignedUploadQuerySchema })],
  }, ctrl.getPresignedUpload);

  // ── 다운로드 ───────────────────────────────────────────────
  app.get('/:id', { preHandler: [requirePermission(Permission.FILE_READ)] }, ctrl.downloadFile);
  app.get('/:id/url', { preHandler: [requirePermission(Permission.FILE_READ)] }, ctrl.getDownloadUrl);
  app.get('/:id/stream', { preHandler: [requirePermission(Permission.FILE_READ)] }, ctrl.streamFile);

  // ── 메타 / 삭제 ────────────────────────────────────────────
  app.get('/:id/meta', { preHandler: [requirePermission(Permission.FILE_READ)] }, ctrl.getFileMeta);
  app.delete('/:id', {
    preHandler: [
      requirePermission(Permission.FILE_DELETE),
      requireOwnerOrAdminFastify(
        (req) => prisma.file.findFirst({ where: { id: (req as any).params.id, orgId: getOrgId(req.headers), isDeleted: false } }),
        'uploaderId',
        ErrorCode.FILE_PERMISSION_DENIED,
      ),
    ],
  }, ctrl.deleteFile);
};

export default fileRoutes;
