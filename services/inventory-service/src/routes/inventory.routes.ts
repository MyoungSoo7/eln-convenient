import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/inventory.controller';
import { requireAuth, requireRole, requirePermission } from '../middlewares/auth.middleware';
import {
  validate, Permission, RoleName, requireOwnerOrAdminFastify, ErrorCode, getOrgId,
} from '@lab/shared';
import prisma from '../lib/prisma';
import {
  CreateItemSchema, UpdateItemSchema, AdjustQuantitySchema,
  CreateCategorySchema, UuidParamsSchema,
} from '../dtos/inventory.dto';

const inventoryRoutes: FastifyPluginAsync = async (app) => {
  // 모든 라우트에 인증 필수
  app.addHook('onRequest', requireAuth);

  // ── 아이템 CRUD ──────────────────────────────────────────
  app.get('/items', { preHandler: [requirePermission(Permission.INVENTORY_READ)] }, ctrl.getItems);

  app.post('/items', {
    preHandler: [requirePermission(Permission.INVENTORY_WRITE), validate({ body: CreateItemSchema })],
  }, ctrl.createItem);

  app.get('/items/barcode/:barcode', { preHandler: [requirePermission(Permission.INVENTORY_READ)] }, ctrl.getItemByBarcode);

  app.get('/items/:id', { preHandler: [requirePermission(Permission.INVENTORY_READ)] }, ctrl.getItemById);

  app.put('/items/:id', {
    preHandler: [
      requirePermission(Permission.INVENTORY_WRITE),
      validate({ params: UuidParamsSchema, body: UpdateItemSchema }),
      requireOwnerOrAdminFastify(
        (req) => prisma.inventoryItem.findFirst({ where: { id: (req as any).params.id, orgId: getOrgId(req.headers) } }),
        'createdBy',
        ErrorCode.ITEM_PERMISSION_DENIED,
      ),
    ],
  }, ctrl.updateItem);

  app.delete('/items/:id', {
    preHandler: [
      requirePermission(Permission.INVENTORY_DELETE),
      requireOwnerOrAdminFastify(
        (req) => prisma.inventoryItem.findFirst({ where: { id: (req as any).params.id, orgId: getOrgId(req.headers) } }),
        'createdBy',
        ErrorCode.ITEM_PERMISSION_DENIED,
      ),
    ],
  }, ctrl.deleteItem);

  // ── 수량 조정 (입출고 이력) ───────────────────────────────
  app.post('/items/:id/quantity', {
    preHandler: [requirePermission(Permission.INVENTORY_WRITE), validate({ params: UuidParamsSchema, body: AdjustQuantitySchema })],
  }, ctrl.adjustQuantity);

  app.get('/items/:id/history', { preHandler: [requirePermission(Permission.INVENTORY_READ)] }, ctrl.getItemHistory);

  // ── 알림 ─────────────────────────────────────────────────
  app.get('/alerts/expiring', { preHandler: [requirePermission(Permission.INVENTORY_READ)] }, ctrl.getExpiringItems);
  app.get('/alerts/low-stock', { preHandler: [requirePermission(Permission.INVENTORY_READ)] }, ctrl.getLowStockItems);

  // ── 카테고리 CRUD ─────────────────────────────────────────
  app.get('/categories', { preHandler: [requirePermission(Permission.INVENTORY_READ)] }, ctrl.getCategories);

  app.post('/categories', {
    preHandler: [requireRole(RoleName.ADMIN), validate({ body: CreateCategorySchema })],
  }, ctrl.createCategory);

  app.put('/categories/:id', {
    preHandler: [requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: CreateCategorySchema })],
  }, ctrl.updateCategory);

  app.delete('/categories/:id', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.deleteCategory);
};

export default inventoryRoutes;
