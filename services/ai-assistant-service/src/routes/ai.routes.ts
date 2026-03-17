import { Router } from 'express';
import * as ctrl from '../controllers/ai.controller';
import { requireAuth, requirePermission, requireInternalSecret } from '../middlewares/auth.middleware';

const router = Router();

// ── 사용자 AI 기능 (인증 필요) ───────────────────────────
router.post('/recommend-template', requireAuth, requirePermission('note:read'),  ctrl.recommendTemplate);
router.post('/draft',              requireAuth, requirePermission('note:write'), ctrl.generateDraft);
router.post('/ask',                requireAuth, requirePermission('note:read'),  ctrl.askQuestion);

// ── 인덱스 관리 (내부 서비스 전용 — x-internal-secret 헤더 필요) ──
router.post('/index',              requireInternalSecret, ctrl.indexDocument);
router.delete('/index/:documentId',requireInternalSecret, ctrl.removeDocument);
router.get('/index/status',        requireInternalSecret, ctrl.getIndexStatus);

export default router;
