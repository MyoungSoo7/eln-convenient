import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler, ErrorCode, createLogger } from '@lab/shared';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import type { ItemType } from '../dtos/inventory.dto';
import { searchClient } from '../lib/searchClient';

const logger = createLogger('inventory-service');

const CATEGORY_CACHE_KEY = 'cache:inv-categories';
const CATEGORY_CACHE_TTL = 1800; // 30분

// ─────────────────────────────────────────────
// 아이템 CRUD
// ─────────────────────────────────────────────

/** GET /api/inventory/items */
export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const {
    type, status, category,
    q,                          // 텍스트 검색 (name, barcode, location)
    tag,                        // 태그 검색
    page = '1', limit = '20',
    sortBy = 'createdAt', sortOrder = 'desc',
  } = req.query;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const where: Record<string, unknown> = {};

  if (type) where.type = type;
  if (status) where.status = status;
  if (category) where.category = category;
  if (tag) where.tags = { has: tag as string };

  if (q) {
    where.OR = [
      { name: { contains: q as string, mode: 'insensitive' } },
      { barcode: { contains: q as string, mode: 'insensitive' } },
      { location: { contains: q as string, mode: 'insensitive' } },
    ];
  }

  const validSortFields = ['name', 'createdAt', 'updatedAt', 'quantity', 'expiryDate'];
  const orderField = validSortFields.includes(sortBy as string) ? sortBy as string : 'createdAt';
  const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { [orderField]: orderDir },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  res.json({ ok: true, data: items, total, page: parseInt(page as string), limit: parseInt(limit as string) });
});

/** GET /api/inventory/items/:id */
export const getItemById = asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);
  res.json({ ok: true, data: item });
});

/** GET /api/inventory/items/barcode/:barcode */
export const getItemByBarcode = asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.inventoryItem.findUnique({ where: { barcode: req.params.barcode } });
  if (!item) throw new AppError(404, '바코드에 해당하는 아이템이 없습니다.', ErrorCode.ITEM_NOT_FOUND);
  res.json({ ok: true, data: item });
});

/** POST /api/inventory/items */
export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const { name, type } = req.body;

  try {
    const item = await prisma.inventoryItem.create({
      data: {
        id: uuidv4(),
        name,
        type,
        status: 'available',
        category: req.body.category || null,
        location: req.body.location || null,
        barcode: req.body.barcode || null,
        quantity: req.body.quantity ?? null,
        unit: req.body.unit || null,
        minQuantity: req.body.minQuantity ?? null,
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null,
        expiryWarningDays: req.body.expiryWarningDays ?? 30,
        metadata: req.body.metadata || {},
        tags: req.body.tags || [],
        createdBy: (req.headers['x-user-id'] as string) || 'anonymous',
      },
    });

    // 초기 입고 이력 기록 (수량이 있는 경우)
    if (item.quantity !== null) {
      await prisma.inventoryHistory.create({
        data: {
          id: uuidv4(),
          itemId: item.id,
          changeType: 'in',
          quantityBefore: 0,
          quantityAfter: item.quantity,
          quantityDelta: item.quantity,
          reason: '최초 등록',
          performedBy: item.createdBy,
        },
      });
    }

    searchClient.index({
      id: item.id,
      doc: {
        domainType: 'INVENTORY',
        title: item.name,
        tags: item.tags,
        ownerId: item.createdBy,
        visibility: 'private',
        docStatus: 'active',
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    });
    res.status(201).json({ ok: true, data: item });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 사용 중인 바코드입니다.', ErrorCode.ITEM_BARCODE_EXISTS);
    }
    throw err;
  }
});

/** PUT /api/inventory/items/:id */
export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);

  const updateData: Record<string, unknown> = {};
  if (req.body.name !== undefined) updateData.name = req.body.name;
  if (req.body.type !== undefined) updateData.type = req.body.type;
  if (req.body.status !== undefined) updateData.status = req.body.status;
  if (req.body.category !== undefined) updateData.category = req.body.category;
  if (req.body.location !== undefined) updateData.location = req.body.location;
  if (req.body.barcode !== undefined) updateData.barcode = req.body.barcode || null;
  if (req.body.quantity !== undefined) updateData.quantity = req.body.quantity;
  if (req.body.unit !== undefined) updateData.unit = req.body.unit;
  if (req.body.minQuantity !== undefined) updateData.minQuantity = req.body.minQuantity;
  if (req.body.expiryDate !== undefined) updateData.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
  if (req.body.expiryWarningDays !== undefined) updateData.expiryWarningDays = req.body.expiryWarningDays;
  if (req.body.metadata !== undefined) updateData.metadata = req.body.metadata;
  if (req.body.tags !== undefined) updateData.tags = req.body.tags;

  try {
    const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: updateData });

    // 상태 변경 이력 기록
    if (req.body.status !== undefined && req.body.status !== existing.status) {
      await prisma.inventoryHistory.create({
        data: {
          id: uuidv4(),
          itemId: item.id,
          changeType: 'status_change',
          statusBefore: existing.status,
          statusAfter: item.status,
          reason: req.body.reason || null,
          performedBy: (req.headers['x-user-id'] as string) || 'anonymous',
        },
      });
    }

    searchClient.index({
      id: item.id,
      doc: {
        domainType: 'INVENTORY',
        title: item.name,
        tags: item.tags,
        ownerId: item.createdBy,
        visibility: 'private',
        docStatus: 'active',
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    });
    res.json({ ok: true, data: item });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 사용 중인 바코드입니다.', ErrorCode.ITEM_BARCODE_EXISTS);
    }
    if (err?.code === 'P2025') {
      throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);
    }
    throw err;
  }
});

/** DELETE /api/inventory/items/:id */
export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
    searchClient.delete(req.params.id);
    res.json({ ok: true, message: '아이템이 삭제되었습니다.', id: req.params.id });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);
    }
    throw err;
  }
});

// ─────────────────────────────────────────────
// 수량 조정 (입출고)
// ─────────────────────────────────────────────

/** POST /api/inventory/items/:id/quantity */
export const adjustQuantity = asyncHandler(async (req: Request, res: Response) => {
  const { changeType, quantity, reason } = req.body;
  const performedBy = (req.headers['x-user-id'] as string) || 'anonymous';

  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);

  const before = item.quantity ?? 0;
  let after: number;
  let delta: number;

  if (changeType === 'in') {
    delta = quantity;
    after = before + quantity;
  } else if (changeType === 'out') {
    if (before < quantity) {
      throw new AppError(400, `재고 부족: 현재 ${before}${item.unit || ''}, 출고 요청 ${quantity}${item.unit || ''}`, ErrorCode.ITEM_STOCK_INSUFFICIENT);
    }
    delta = -quantity;
    after = before - quantity;
  } else {
    // adjust: 절대값으로 설정
    delta = quantity - before;
    after = quantity;
  }

  // 자동 상태 변경: 수량 0 이면 depleted
  const newStatus = after === 0 ? 'depleted' : (item.status === 'depleted' && after > 0 ? 'available' : item.status);

  const [updated] = await prisma.$transaction([
    prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: { quantity: after, status: newStatus },
    }),
    prisma.inventoryHistory.create({
      data: {
        id: uuidv4(),
        itemId: req.params.id,
        changeType,
        quantityBefore: before,
        quantityAfter: after,
        quantityDelta: delta,
        reason: reason || null,
        performedBy,
      },
    }),
  ]);

  res.json({ ok: true, data: updated, history: { before, after, delta } });
});

/** GET /api/inventory/items/:id/history */
export const getItemHistory = asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);

  const history = await prisma.inventoryHistory.findMany({
    where: { itemId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ ok: true, data: history, total: history.length });
});

// ─────────────────────────────────────────────
// 만료 임박 / 재고 부족 알림
// ─────────────────────────────────────────────

/** GET /api/inventory/alerts/expiring — 만료 임박 아이템 */
export const getExpiringItems = asyncHandler(async (req: Request, res: Response) => {
  // 각 아이템의 expiryWarningDays 기준으로 필터
  // PostgreSQL에서 동적 날짜 비교를 위해 raw query 대신 넉넉한 범위로 조회 후 JS 필터
  const daysAhead = parseInt(req.query.days as string) || 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const items = await prisma.inventoryItem.findMany({
    where: {
      expiryDate: { not: null, lte: cutoff },
      status: { notIn: ['disposed', 'depleted'] },
    },
    orderBy: { expiryDate: 'asc' },
  });

  // 각 아이템별 expiryWarningDays 기준으로 경고 여부 판별
  const now = new Date();
  const result = items.map((item) => {
    const expiry = item.expiryDate!;
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      ...item,
      daysLeft,
      isExpired: daysLeft < 0,
      isWarning: daysLeft >= 0 && daysLeft <= item.expiryWarningDays,
    };
  });

  res.json({ ok: true, data: result, total: result.length });
});

/** GET /api/inventory/alerts/low-stock — 재고 부족 아이템 */
export const getLowStockItems = asyncHandler(async (req: Request, res: Response) => {
  // minQuantity가 설정된 아이템 중 현재 quantity <= minQuantity 인 것
  const items = await prisma.inventoryItem.findMany({
    where: {
      minQuantity: { not: null },
      status: { notIn: ['disposed', 'depleted'] },
    },
  });

  const lowStock = items.filter(
    (item) => item.minQuantity !== null && (item.quantity ?? 0) <= item.minQuantity,
  );

  res.json({ ok: true, data: lowStock, total: lowStock.length });
});

// ─────────────────────────────────────────────
// 카테고리 CRUD
// ─────────────────────────────────────────────

/** GET /api/inventory/categories (Redis 캐시 적용: 30분 TTL) */
export const getCategories = asyncHandler(async (_req: Request, res: Response) => {
  // Redis 캐시 확인
  if (redis) {
    try {
      const cached = await redis.get(CATEGORY_CACHE_KEY);
      if (cached) {
        res.json({ ok: true, data: JSON.parse(cached) });
        return;
      }
    } catch { /* Redis 오류 무시 → DB 폴백 */ }
  }

  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });

  // Redis에 캐싱
  if (redis) {
    try { await redis.set(CATEGORY_CACHE_KEY, JSON.stringify(categories), 'EX', CATEGORY_CACHE_TTL); } catch { /* 무시 */ }
  }

  res.json({ ok: true, data: categories });
});

/** 카테고리 캐시 무효화 헬퍼 */
async function invalidateCategoryCache(): Promise<void> {
  if (redis) { try { await redis.del(CATEGORY_CACHE_KEY); } catch { /* 무시 */ } }
}

/** POST /api/inventory/categories */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  try {
    const category = await prisma.category.create({ data: { id: uuidv4(), name: name.trim() } });
    await invalidateCategoryCache();
    res.status(201).json({ ok: true, data: category });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 존재하는 카테고리입니다.', ErrorCode.CATEGORY_EXISTS);
    }
    throw err;
  }
});

/** PUT /api/inventory/categories/:id */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  try {
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
    });
    await invalidateCategoryCache();
    res.json({ ok: true, data: category });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      throw new AppError(404, '카테고리를 찾을 수 없습니다.', ErrorCode.CATEGORY_NOT_FOUND);
    }
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 존재하는 카테고리 이름입니다.', ErrorCode.CATEGORY_EXISTS);
    }
    throw err;
  }
});

/** DELETE /api/inventory/categories/:id */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    await invalidateCategoryCache();
    res.json({ ok: true, message: '카테고리가 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      throw new AppError(404, '카테고리를 찾을 수 없습니다.', ErrorCode.CATEGORY_NOT_FOUND);
    }
    throw err;
  }
});
