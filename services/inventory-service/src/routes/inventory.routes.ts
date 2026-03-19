import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import {
  CreateItemSchema, UpdateItemSchema, AdjustQuantitySchema,
  CreateCategorySchema, UuidParamsSchema,
} from '../dtos/inventory.dto';

const router = Router();

router.use(requireAuth);

// ── 아이템 CRUD ──────────────────────────────────────────
router.get('/items',                    requirePermission('inventory:read'),    ctrl.getItems);
router.post('/items',                   requirePermission('inventory:write'),   validate({ body: CreateItemSchema }), ctrl.createItem);
router.get('/items/barcode/:barcode',   requirePermission('inventory:read'),    ctrl.getItemByBarcode);
router.get('/items/:id',                requirePermission('inventory:read'),    ctrl.getItemById);
router.put('/items/:id',                requirePermission('inventory:write'),   validate({ params: UuidParamsSchema, body: UpdateItemSchema }), ctrl.updateItem);
router.delete('/items/:id',             requirePermission('inventory:delete'),  ctrl.deleteItem);

// ── 수량 조정 (입출고 이력) ───────────────────────────────
router.post('/items/:id/quantity',      requirePermission('inventory:write'),   validate({ params: UuidParamsSchema, body: AdjustQuantitySchema }), ctrl.adjustQuantity);
router.get('/items/:id/history',        requirePermission('inventory:read'),    ctrl.getItemHistory);

// ── 알림 ─────────────────────────────────────────────────
router.get('/alerts/expiring',          requirePermission('inventory:read'),    ctrl.getExpiringItems);
router.get('/alerts/low-stock',         requirePermission('inventory:read'),    ctrl.getLowStockItems);

// ── 카테고리 CRUD ─────────────────────────────────────────
router.get('/categories',               requirePermission('inventory:read'),    ctrl.getCategories);
router.post('/categories',              requireRole('admin'),                   validate({ body: CreateCategorySchema }), ctrl.createCategory);
router.put('/categories/:id',           requireRole('admin'),                   validate({ params: UuidParamsSchema, body: CreateCategorySchema }), ctrl.updateCategory);
router.delete('/categories/:id',        requireRole('admin'),                   ctrl.deleteCategory);

export default router;
