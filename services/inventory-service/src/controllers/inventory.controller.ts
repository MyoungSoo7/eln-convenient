import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ErrorCode, createLogger, getOrgId, withOrgScope } from '@lab/shared';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import type { ItemType } from '../dtos/inventory.dto';
import { searchClient } from '../lib/searchClient';

const logger = createLogger('inventory-service');

const CATEGORY_CACHE_KEY_PREFIX = 'cache:inv-categories';
const CATEGORY_CACHE_TTL = 1800; // 30분

// ─────────────────────────────────────────────
// 아이템 CRUD
// ─────────────────────────────────────────────

/** GET /api/inventory/items */
export async function getItems(request: FastifyRequest, reply: FastifyReply) {
  const {
    type, status, category,
    q,                          // 텍스트 검색 (name, barcode, location)
    tag,                        // 태그 검색
    page = '1', limit = '20',
    sortBy = 'createdAt', sortOrder = 'desc',
  } = request.query as Record<string, string>;

  const orgId = getOrgId(request.headers);
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const where: Record<string, unknown> = { orgId };

  if (type) where.type = type;
  if (status) where.status = status;
  if (category) where.category = category;
  if (tag) where.tags = { has: tag };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { barcode: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } },
    ];
  }

  const validSortFields = ['name', 'createdAt', 'updatedAt', 'quantity', 'expiryDate'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
  const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { [orderField]: orderDir },
      skip,
      take: parseInt(limit),
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  return { ok: true, data: items, total, page: parseInt(page), limit: parseInt(limit) };
}

/** GET /api/inventory/items/:id */
export async function getItemById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const item = await prisma.inventoryItem.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!item) throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);
  return { ok: true, data: item };
}

/** GET /api/inventory/items/barcode/:barcode */
export async function getItemByBarcode(request: FastifyRequest, reply: FastifyReply) {
  const { barcode } = request.params as { barcode: string };
  const item = await prisma.inventoryItem.findFirst({ where: { barcode, orgId: getOrgId(request.headers) } });
  if (!item) throw new AppError(404, '바코드에 해당하는 아이템이 없습니다.', ErrorCode.ITEM_NOT_FOUND);
  return { ok: true, data: item };
}

/** POST /api/inventory/items */
export async function createItem(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const { name, type } = body;

  try {
    const item = await prisma.inventoryItem.create({
      data: {
        id: uuidv4(),
        name,
        orgId: getOrgId(request.headers),
        type,
        status: 'available',
        category: body.category || null,
        location: body.location || null,
        barcode: body.barcode || null,
        quantity: body.quantity ?? null,
        unit: body.unit || null,
        minQuantity: body.minQuantity ?? null,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        expiryWarningDays: body.expiryWarningDays ?? 30,
        metadata: body.metadata || {},
        tags: body.tags || [],
        createdBy: (request.headers['x-user-id'] as string) || 'anonymous',
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
        orgId: item.orgId,
        tags: item.tags,
        ownerId: item.createdBy,
        visibility: 'private',
        docStatus: 'active',
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    });
    reply.code(201);
    return { ok: true, data: item };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 사용 중인 바코드입니다.', ErrorCode.ITEM_BARCODE_EXISTS);
    }
    throw err;
  }
}

/** PUT /api/inventory/items/:id */
export async function updateItem(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  // 소유권 검증은 라우트의 requireOwnerOrAdmin preHandler에서 수행됨
  const existing = (request as any).routeResource;

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.type !== undefined) updateData.type = body.type;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.location !== undefined) updateData.location = body.location;
  if (body.barcode !== undefined) updateData.barcode = body.barcode || null;
  if (body.quantity !== undefined) updateData.quantity = body.quantity;
  if (body.unit !== undefined) updateData.unit = body.unit;
  if (body.minQuantity !== undefined) updateData.minQuantity = body.minQuantity;
  if (body.expiryDate !== undefined) updateData.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
  if (body.expiryWarningDays !== undefined) updateData.expiryWarningDays = body.expiryWarningDays;
  if (body.metadata !== undefined) updateData.metadata = body.metadata;
  if (body.tags !== undefined) updateData.tags = body.tags;

  try {
    const item = await prisma.inventoryItem.update({ where: { id }, data: updateData });

    // 상태 변경 이력 기록
    if (body.status !== undefined && body.status !== existing.status) {
      await prisma.inventoryHistory.create({
        data: {
          id: uuidv4(),
          itemId: item.id,
          changeType: 'status_change',
          statusBefore: existing.status,
          statusAfter: item.status,
          reason: body.reason || null,
          performedBy: (request.headers['x-user-id'] as string) || 'anonymous',
        },
      });
    }

    searchClient.index({
      id: item.id,
      doc: {
        domainType: 'INVENTORY',
        title: item.name,
        orgId: item.orgId,
        tags: item.tags,
        ownerId: item.createdBy,
        visibility: 'private',
        docStatus: 'active',
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    });
    return { ok: true, data: item };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 사용 중인 바코드입니다.', ErrorCode.ITEM_BARCODE_EXISTS);
    }
    if (err?.code === 'P2025') {
      throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);
    }
    throw err;
  }
}

/** DELETE /api/inventory/items/:id */
export async function deleteItem(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  // 소유권 검증은 라우트의 requireOwnerOrAdmin preHandler에서 수행됨
  await prisma.inventoryItem.delete({ where: { id } });
  searchClient.delete(id);
  return { ok: true, message: '아이템이 삭제되었습니다.', id };
}

// ─────────────────────────────────────────────
// 수량 조정 (입출고)
// ─────────────────────────────────────────────

/** POST /api/inventory/items/:id/quantity */
export async function adjustQuantity(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { changeType, quantity, reason } = request.body as any;
  const performedBy = (request.headers['x-user-id'] as string) || 'anonymous';

  const item = await prisma.inventoryItem.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
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
      where: { id },
      data: { quantity: after, status: newStatus },
    }),
    prisma.inventoryHistory.create({
      data: {
        id: uuidv4(),
        itemId: id,
        changeType,
        quantityBefore: before,
        quantityAfter: after,
        quantityDelta: delta,
        reason: reason || null,
        performedBy,
      },
    }),
  ]);

  // 검색 인덱스 동기화 (수량/상태 변경 반영)
  searchClient.index({
    id: updated.id,
    doc: {
      domainType: 'INVENTORY',
      title: updated.name,
      orgId: updated.orgId,
      tags: updated.tags,
      ownerId: updated.createdBy,
      visibility: 'private',
      docStatus: 'active',
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });

  return { ok: true, data: updated, history: { before, after, delta } };
}

/** GET /api/inventory/items/:id/history */
export async function getItemHistory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const item = await prisma.inventoryItem.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!item) throw new AppError(404, '아이템을 찾을 수 없습니다.', ErrorCode.ITEM_NOT_FOUND);

  const history = await prisma.inventoryHistory.findMany({
    where: { itemId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return { ok: true, data: history, total: history.length };
}

// ─────────────────────────────────────────────
// 만료 임박 / 재고 부족 알림
// ─────────────────────────────────────────────

/** GET /api/inventory/alerts/expiring — 만료 임박 아이템 */
export async function getExpiringItems(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request.headers);
  const { days = '90' } = request.query as Record<string, string>;
  const daysAhead = parseInt(days) || 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const items = await prisma.inventoryItem.findMany({
    where: {
      orgId,
      expiryDate: { not: null, lte: cutoff },
      status: { notIn: ['disposed', 'depleted'] },
    },
    orderBy: { expiryDate: 'asc' },
  });

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

  return { ok: true, data: result, total: result.length };
}

/** GET /api/inventory/alerts/low-stock — 재고 부족 아이템 */
export async function getLowStockItems(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request.headers);
  const items = await prisma.inventoryItem.findMany({
    where: {
      orgId,
      minQuantity: { not: null },
      status: { notIn: ['disposed', 'depleted'] },
    },
  });

  const lowStock = items.filter(
    (item) => item.minQuantity !== null && (item.quantity ?? 0) <= item.minQuantity,
  );

  return { ok: true, data: lowStock, total: lowStock.length };
}

// ─────────────────────────────────────────────
// 카테고리 CRUD
// ─────────────────────────────────────────────

/** GET /api/inventory/categories (Redis 캐시 적용: 30분 TTL) */
export async function getCategories(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request.headers);
  const cacheKey = `${CATEGORY_CACHE_KEY_PREFIX}:${orgId}`;

  // Redis 캐시 확인
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return { ok: true, data: JSON.parse(cached) };
      }
    } catch { /* Redis 오류 무시 → DB 폴백 */ }
  }

  const categories = await prisma.category.findMany({ where: { orgId }, orderBy: { name: 'asc' } });

  // Redis에 캐싱
  if (redis) {
    try { await redis.set(cacheKey, JSON.stringify(categories), 'EX', CATEGORY_CACHE_TTL); } catch { /* 무시 */ }
  }

  return { ok: true, data: categories };
}

/** 카테고리 캐시 무효화 헬퍼 */
async function invalidateCategoryCache(orgId: string): Promise<void> {
  if (redis) { try { await redis.del(`${CATEGORY_CACHE_KEY_PREFIX}:${orgId}`); } catch { /* 무시 */ } }
}

/** POST /api/inventory/categories */
export async function createCategory(request: FastifyRequest, reply: FastifyReply) {
  const { name } = request.body as { name: string };
  const orgId = getOrgId(request.headers);
  try {
    const category = await prisma.category.create({ data: { id: uuidv4(), name: name.trim(), orgId } });
    await invalidateCategoryCache(orgId);
    reply.code(201);
    return { ok: true, data: category };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 존재하는 카테고리입니다.', ErrorCode.CATEGORY_EXISTS);
    }
    throw err;
  }
}

/** PUT /api/inventory/categories/:id */
export async function updateCategory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { name } = request.body as { name: string };
  const orgId = getOrgId(request.headers);

  const existing = await prisma.category.findFirst({ where: { id, orgId } });
  if (!existing) throw new AppError(404, '카테고리를 찾을 수 없습니다.', ErrorCode.CATEGORY_NOT_FOUND);

  try {
    const category = await prisma.category.update({
      where: { id },
      data: { name: name.trim() },
    });
    await invalidateCategoryCache(orgId);
    return { ok: true, data: category };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 존재하는 카테고리 이름입니다.', ErrorCode.CATEGORY_EXISTS);
    }
    throw err;
  }
}

/** DELETE /api/inventory/categories/:id */
export async function deleteCategory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const orgId = getOrgId(request.headers);

  const existing = await prisma.category.findFirst({ where: { id, orgId } });
  if (!existing) throw new AppError(404, '카테고리를 찾을 수 없습니다.', ErrorCode.CATEGORY_NOT_FOUND);

  await prisma.category.delete({ where: { id } });
  await invalidateCategoryCache(orgId);
  return { ok: true, message: '카테고리가 삭제되었습니다.' };
}

/**
 * POST /api/inventory/admin/reindex — 통합검색 일괄 재색인 (관리자 전용)
 *
 * 전체 조직의 InventoryItem을 순회하며 SEARCH_INDEX 이벤트를 Redis Stream에 발행.
 * 발행만 동기적이며, OpenSearch 반영은 search-service consumer가 비동기로 처리한다.
 */
export async function adminReindexAll(request: FastifyRequest, reply: FastifyReply) {
  const actorId = (request.headers['x-user-id'] as string) || 'anonymous';
  const orgId = getOrgId(request.headers);
  logger.info({ actorId, orgId }, '[admin-reindex] 인벤토리 조직 재색인 시작');

  const items = await prisma.inventoryItem.findMany({
    where: { orgId },
    select: {
      id: true, name: true, orgId: true, tags: true,
      createdBy: true, createdAt: true, updatedAt: true,
    },
  });

  let count = 0;
  for (const item of items) {
    searchClient.index({
      id: item.id,
      doc: {
        domainType: 'INVENTORY',
        title: item.name,
        orgId: item.orgId,
        tags: item.tags,
        ownerId: item.createdBy,
        visibility: 'private',
        docStatus: 'active',
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    });
    count++;
  }

  logger.info({ actorId, orgId, count }, '[admin-reindex] 인벤토리 조직 재색인 발행 완료');

  return {
    ok: true,
    data: { itemCount: count },
    message: `인벤토리 ${count}건 재색인 요청을 발행했습니다.`,
  };
}
