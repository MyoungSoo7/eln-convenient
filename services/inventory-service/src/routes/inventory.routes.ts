import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate, Permission, RoleName } from '@lab/shared';
import {
  CreateItemSchema, UpdateItemSchema, AdjustQuantitySchema,
  CreateCategorySchema, UuidParamsSchema,
} from '../dtos/inventory.dto';

const router = Router();

router.use(requireAuth);

// ── 아이템 CRUD ──────────────────────────────────────────
router.get('/items',                    requirePermission(Permission.INVENTORY_READ),    ctrl.getItems);
router.post('/items',                   requirePermission(Permission.INVENTORY_WRITE),   validate({ body: CreateItemSchema }), ctrl.createItem);
router.get('/items/barcode/:barcode',   requirePermission(Permission.INVENTORY_READ),    ctrl.getItemByBarcode);
router.get('/items/:id',                requirePermission(Permission.INVENTORY_READ),    ctrl.getItemById);
router.put('/items/:id',                requirePermission(Permission.INVENTORY_WRITE),   validate({ params: UuidParamsSchema, body: UpdateItemSchema }), ctrl.updateItem);
router.delete('/items/:id',             requirePermission(Permission.INVENTORY_DELETE),  ctrl.deleteItem);

// ── 수량 조정 (입출고 이력) ───────────────────────────────
router.post('/items/:id/quantity',      requirePermission(Permission.INVENTORY_WRITE),   validate({ params: UuidParamsSchema, body: AdjustQuantitySchema }), ctrl.adjustQuantity);
router.get('/items/:id/history',        requirePermission(Permission.INVENTORY_READ),    ctrl.getItemHistory);

// ── 알림 ─────────────────────────────────────────────────
router.get('/alerts/expiring',          requirePermission(Permission.INVENTORY_READ),    ctrl.getExpiringItems);
router.get('/alerts/low-stock',         requirePermission(Permission.INVENTORY_READ),    ctrl.getLowStockItems);

// ── 카테고리 CRUD ─────────────────────────────────────────
router.get('/categories',               requirePermission(Permission.INVENTORY_READ),    ctrl.getCategories);
router.post('/categories',              requireRole(RoleName.ADMIN),                   validate({ body: CreateCategorySchema }), ctrl.createCategory);
router.put('/categories/:id',           requireRole(RoleName.ADMIN),                   validate({ params: UuidParamsSchema, body: CreateCategorySchema }), ctrl.updateCategory);
router.delete('/categories/:id',        requireRole(RoleName.ADMIN),                   ctrl.deleteCategory);

export default router;
