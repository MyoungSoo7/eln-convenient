// services/file-service/src/routes/export.routes.ts
import { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { requireAuth, requireInternalSecret } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import { ListExportsQuerySchema, JobIdParamsSchema } from '../dtos/file.dto';
import * as ctrl from '../controllers/export.controller';

const exportRoutes: FastifyPluginAsync = async (app) => {
  // ── 내부 서비스 전용 (인증: x-internal-secret) ──
  // 내부 업로드는 200MB 제한이 필요하므로 별도 scope에 등록
  app.register(async (scope) => {
    scope.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB
    scope.post('/internal/upload', { preHandler: [requireInternalSecret] }, ctrl.internalUploadExport);
  });

  app.get('/internal/presigned/:fileId', { preHandler: [requireInternalSecret] }, ctrl.internalPresignedUrl);

  // ── 사용자 API (인증: JWT/x-user-id) ──
  app.register(async (scope) => {
    scope.addHook('onRequest', requireAuth);

    scope.post('/', ctrl.createExport);
    scope.get('/', { preHandler: [validate({ query: ListExportsQuerySchema })] }, ctrl.listExports);
    scope.get('/:jobId', { preHandler: [validate({ params: JobIdParamsSchema })] }, ctrl.getExport);
    scope.get('/:jobId/download', { preHandler: [validate({ params: JobIdParamsSchema })] }, ctrl.downloadExport);
    scope.delete('/:jobId', { preHandler: [validate({ params: JobIdParamsSchema })] }, ctrl.cancelExport);
  });
};

export default exportRoutes;
