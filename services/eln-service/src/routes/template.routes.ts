import { FastifyInstance } from 'fastify';
import * as ctrl from '../controllers/template.controller';

export async function templateRoutes(app: FastifyInstance) {
  app.get('/', ctrl.listTemplates);
  app.post('/', ctrl.createTemplate);
  app.get('/:id', ctrl.getTemplate);
  app.post('/recommend', ctrl.recommendTemplates);
}
