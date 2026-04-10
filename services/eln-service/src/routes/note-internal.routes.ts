import { FastifyPluginAsync } from 'fastify';
import { requireInternalSecret } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/note-internal.controller';

/**
 * 내부 전용 노트 라우트
 *
 * 별도 플러그인 scope — note.routes.ts의 전역 requireAuth 훅을 피한다.
 * 대신 모든 엔드포인트에 requireInternalSecret 적용.
 *
 * 용도: 재인덱싱, 연구/파인튜닝 데이터셋 export, 백업 등
 */
const noteInternalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireInternalSecret);

  app.get('/notes/internal/all', ctrl.getAllNotesInternal);
  app.get('/notes/internal/count', ctrl.getNotesCountInternal);
};

export default noteInternalRoutes;
