import { FastifyInstance } from 'fastify';
import * as ctrl from '../controllers/export.controller';

export async function exportRoutes(app: FastifyInstance) {
  app.post('/pdf/:noteId', ctrl.exportPdf);
  app.get('/status/:jobId', ctrl.getExportStatus);
  app.post('/zip', ctrl.exportZip);
}
