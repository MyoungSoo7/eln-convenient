import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/export.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
import { validate, Permission } from '@lab/shared';
import {
  ExportPdfParamsSchema,
  ExportZipBodySchema,
  ExportReportBodySchema,
  ExportStatusParamsSchema,
} from '../dtos/signature.dto';

const exportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/list', { preHandler: [requirePermission(Permission.EXPORT_PDF)] }, ctrl.listExportJobs);
  app.post('/pdf/:noteId', { preHandler: [requirePermission(Permission.EXPORT_PDF), validate({ params: ExportPdfParamsSchema })] }, ctrl.exportPdf);
  app.post('/zip', { preHandler: [requirePermission(Permission.EXPORT_PDF), validate({ body: ExportZipBodySchema })] }, ctrl.exportZip);
  app.post('/report', { preHandler: [requirePermission(Permission.EXPORT_PDF), validate({ body: ExportReportBodySchema })] }, ctrl.exportReport);
  app.get('/status/:jobId', { preHandler: [requirePermission(Permission.EXPORT_PDF), validate({ params: ExportStatusParamsSchema })] }, ctrl.getExportStatus);
};

export default exportRoutes;
