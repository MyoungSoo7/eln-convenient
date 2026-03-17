import { Router } from 'express';
import * as ctrl from '../controllers/search.controller';
import { requireAuth, requirePermission, requireInternalSecret } from '../middlewares/auth.middleware';

const router = Router();

// ── 공개 검색 (사용자 인증 필요) ──────────────────────────
router.get('/',         requireAuth, requirePermission('note:read'), ctrl.search);
router.get('/suggest',  requireAuth, requirePermission('note:read'), ctrl.suggest);

// ── 인덱스 관리 (내부 서비스 전용 — x-internal-secret 헤더 필요) ──
router.post('/index',               requireInternalSecret, ctrl.indexDoc);
router.post('/index/bulk',          requireInternalSecret, ctrl.bulkIndexDocs);
router.delete('/index/:type/:id',   requireInternalSecret, ctrl.removeDoc);
router.get('/stats',                requireInternalSecret, ctrl.statsHandler);

export default router;
