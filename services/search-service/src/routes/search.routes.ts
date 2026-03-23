import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/search.controller';
import * as historyCtrl from '../controllers/history.controller';
import * as favoritesCtrl from '../controllers/favorites.controller';
import * as keywordFavCtrl from '../controllers/keyword-favorites.controller';
import { requireAuth, requirePermission, requireInternalSecret } from '../middlewares/auth.middleware';
import { validate, Permission } from '@lab/shared';
import {
  IndexDocBodySchema, BulkIndexBodySchema,
  SaveHistoryBodySchema,
  AddFavoriteBodySchema, GetFavoritesQuerySchema,
  AddKeywordFavoriteBodySchema,
} from '../dtos/search.dto';

const searchRoutes: FastifyPluginAsync = async (app) => {
  // ── 통합 검색 (사용자 인증 필요) ──────────────────────────
  app.get('/', { preHandler: [requireAuth, requirePermission(Permission.NOTE_READ)] }, ctrl.search);
  app.get('/suggest', { preHandler: [requireAuth, requirePermission(Permission.NOTE_READ)] }, ctrl.suggest);

  // ── 검색 히스토리 ─────────────────────────────────────────
  app.post('/history', { preHandler: [requireAuth, validate({ body: SaveHistoryBodySchema })] }, historyCtrl.saveHistory);
  app.get('/history', { preHandler: [requireAuth] }, historyCtrl.getHistory);
  app.delete('/history', { preHandler: [requireAuth] }, historyCtrl.clearHistory);
  app.delete('/history/:id', { preHandler: [requireAuth] }, historyCtrl.deleteHistoryEntry);

  // ── 즐겨찾기 ─────────────────────────────────────────────
  app.post('/favorites', { preHandler: [requireAuth, validate({ body: AddFavoriteBodySchema })] }, favoritesCtrl.addFavorite);
  app.delete('/favorites/:id', { preHandler: [requireAuth] }, favoritesCtrl.removeFavorite);
  app.get('/favorites', { preHandler: [requireAuth, validate({ query: GetFavoritesQuerySchema })] }, favoritesCtrl.getFavorites);

  // ── 검색어 즐겨찾기 ─────────────────────────────────────
  app.post('/keyword-favorites', { preHandler: [requireAuth, validate({ body: AddKeywordFavoriteBodySchema })] }, keywordFavCtrl.addKeywordFavorite);
  app.get('/keyword-favorites', { preHandler: [requireAuth] }, keywordFavCtrl.getKeywordFavorites);
  app.delete('/keyword-favorites/:id', { preHandler: [requireAuth] }, keywordFavCtrl.removeKeywordFavorite);

  // ── 인덱스 관리 (내부 서비스 전용 — x-internal-secret 헤더 필요) ──
  app.post('/index', { preHandler: [requireInternalSecret, validate({ body: IndexDocBodySchema })] }, ctrl.indexDoc);
  app.post('/index/bulk', { preHandler: [requireInternalSecret, validate({ body: BulkIndexBodySchema })] }, ctrl.bulkIndexDocs);
  app.delete('/index/:id', { preHandler: [requireInternalSecret] }, ctrl.removeDoc);
  app.get('/stats', { preHandler: [requireInternalSecret] }, ctrl.statsHandler);
};

export default searchRoutes;
