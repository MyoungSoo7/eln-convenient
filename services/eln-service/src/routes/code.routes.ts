import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/code.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { RoleName } from '@lab/shared';

const codeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  // 모든 인증 사용자: 코드 조회
  app.get('/', ctrl.listCodes);

  // admin 전용: 코드 관리
  app.get('/groups', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.listGroups);
  app.post('/', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.createCode);
  app.put('/:id', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.updateCode);
  app.delete('/:id', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.deleteCode);
};

export default codeRoutes;
