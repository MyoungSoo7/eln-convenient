// services/file-service/src/routes/export.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { requireAuth, requireInternalSecret } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import { ListExportsQuerySchema, JobIdParamsSchema } from '../dtos/file.dto';
import * as ctrl from '../controllers/export.controller';

const exportRoutes: FastifyPluginAsync = async (app) => {
  // ── 내부 서비스 전용 (인증: x-internal-secret) ──
  // multipart는 app.ts에서 전역 등록됨 (50MB), 내부 업로드는 bodyLimit으로 제한
  app.post('/internal/upload', { preHandler: [requireInternalSecret], bodyLimit: 200 * 1024 * 1024 }, ctrl.internalUploadExport);

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
