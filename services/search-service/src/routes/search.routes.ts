import { Router } from 'express';
import * as ctrl from '../controllers/search.controller';
import * as historyCtrl from '../controllers/history.controller';
import * as favoritesCtrl from '../controllers/favorites.controller';
import * as keywordFavCtrl from '../controllers/keyword-favorites.controller';
import { requireAuth, requirePermission, requireInternalSecret } from '../middlewares/auth.middleware';

const router = Router();

// ── 통합 검색 (사용자 인증 필요) ──────────────────────────
router.get('/',         requireAuth, requirePermission('note:read'), ctrl.search);
router.get('/suggest',  requireAuth, requirePermission('note:read'), ctrl.suggest);

// ── 검색 히스토리 ─────────────────────────────────────────
// 주의: DELETE /history 는 반드시 DELETE /history/:id 보다 먼저 등록
router.post('/history',         requireAuth, historyCtrl.saveHistory);
router.get('/history',          requireAuth, historyCtrl.getHistory);
router.delete('/history',       requireAuth, historyCtrl.clearHistory);
router.delete('/history/:id',   requireAuth, historyCtrl.deleteHistoryEntry);

// ── 즐겨찾기 ─────────────────────────────────────────────
router.post('/favorites',       requireAuth, favoritesCtrl.addFavorite);
router.delete('/favorites/:id', requireAuth, favoritesCtrl.removeFavorite);
router.get('/favorites',        requireAuth, favoritesCtrl.getFavorites);

// ── 검색어 즐겨찾기 ─────────────────────────────────────
router.post('/keyword-favorites',       requireAuth, keywordFavCtrl.addKeywordFavorite);
router.get('/keyword-favorites',        requireAuth, keywordFavCtrl.getKeywordFavorites);
router.delete('/keyword-favorites/:id', requireAuth, keywordFavCtrl.removeKeywordFavorite);

// ── 인덱스 관리 (내부 서비스 전용 — x-internal-secret 헤더 필요) ──
router.post('/index',               requireInternalSecret, ctrl.indexDoc);
router.post('/index/bulk',          requireInternalSecret, ctrl.bulkIndexDocs);
router.delete('/index/:id', requireInternalSecret, ctrl.removeDoc);
router.get('/stats',                requireInternalSecret, ctrl.statsHandler);

export default router;
