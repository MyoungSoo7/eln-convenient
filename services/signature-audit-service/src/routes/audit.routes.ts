import { FastifyInstance } from 'fastify';
import * as ctrl from '../controllers/audit.controller';

export async function auditRoutes(app: FastifyInstance) {
  app.get('/', ctrl.listAuditLogs);
  app.get('/:id', ctrl.getAuditLog);
}
