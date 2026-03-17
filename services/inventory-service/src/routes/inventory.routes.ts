import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// ── 아이템 CRUD ──────────────────────────────────────────
router.get('/items',                    requirePermission('inventory:read'),    ctrl.getItems);
router.post('/items',                   requirePermission('inventory:write'),   ctrl.createItem);
router.get('/items/barcode/:barcode',   requirePermission('inventory:read'),    ctrl.getItemByBarcode);
router.get('/items/:id',                requirePermission('inventory:read'),    ctrl.getItemById);
router.put('/items/:id',                requirePermission('inventory:write'),   ctrl.updateItem);
router.delete('/items/:id',             requirePermission('inventory:delete'),  ctrl.deleteItem);

// ── 수량 조정 (입출고 이력) ───────────────────────────────
router.post('/items/:id/quantity',      requirePermission('inventory:write'),   ctrl.adjustQuantity);
router.get('/items/:id/history',        requirePermission('inventory:read'),    ctrl.getItemHistory);

// ── 알림 ─────────────────────────────────────────────────
router.get('/alerts/expiring',          requirePermission('inventory:read'),    ctrl.getExpiringItems);
router.get('/alerts/low-stock',         requirePermission('inventory:read'),    ctrl.getLowStockItems);

// ── 카테고리 CRUD ─────────────────────────────────────────
router.get('/categories',               requirePermission('inventory:read'),    ctrl.getCategories);
router.post('/categories',              requireRole('admin'),                   ctrl.createCategory);
router.put('/categories/:id',           requireRole('admin'),                   ctrl.updateCategory);
router.delete('/categories/:id',        requireRole('admin'),                   ctrl.deleteCategory);

export default router;
