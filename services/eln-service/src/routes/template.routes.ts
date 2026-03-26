import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/template.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';
import { validate, Permission } from '@lab/shared';
import { CreateTemplateSchema, UpdateTemplateSchema } from '../dtos/note.dto';

const templateRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', { preHandler: [requirePermission(Permission.TEMPLATE_READ)] }, ctrl.listTemplates);
  app.post('/', { preHandler: [requirePermission(Permission.TEMPLATE_WRITE), validate({ body: CreateTemplateSchema })] }, ctrl.createTemplate);
  app.post('/recommend', { preHandler: [requirePermission(Permission.TEMPLATE_READ)] }, ctrl.recommendTemplates);
  app.get('/:id', { preHandler: [requirePermission(Permission.TEMPLATE_READ)] }, ctrl.getTemplate);
  app.put('/:id', { preHandler: [requirePermission(Permission.TEMPLATE_WRITE), validate({ body: UpdateTemplateSchema })] }, ctrl.updateTemplate);
  app.delete('/:id', { preHandler: [requirePermission(Permission.TEMPLATE_WRITE)] }, ctrl.deleteTemplate);
  // (3) 템플릿 복사
  app.post('/:id/copy', { preHandler: [requirePermission(Permission.TEMPLATE_WRITE)] }, ctrl.copyTemplate);
};

export default templateRoutes;
