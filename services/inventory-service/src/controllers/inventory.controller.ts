import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { VALID_ITEM_TYPES } from '../dtos/inventory.dto';
import { searchClient } from '../lib/searchClient';

// ─────────────────────────────────────────────
// 아이템 CRUD
// ─────────────────────────────────────────────

/** GET /api/inventory/items */
export async function getItems(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (err) {
    console.error('[getItems]', err);
    res.status(500).json({ ok: false, error: '목록 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/inventory/items/:id */
export async function getItemById(req: Request, res: Response): Promise<void> {
  try {
    const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!item) { res.status(404).json({ ok: false, error: '아이템을 찾을 수 없습니다.' }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    console.error('[getItemById]', err);
    res.status(500).json({ ok: false, error: '아이템 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/inventory/items/barcode/:barcode */
export async function getItemByBarcode(req: Request, res: Response): Promise<void> {
  try {
    const item = await prisma.inventoryItem.findUnique({ where: { barcode: req.params.barcode } });
    if (!item) { res.status(404).json({ ok: false, error: '바코드에 해당하는 아이템이 없습니다.' }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    console.error('[getItemByBarcode]', err);
    res.status(500).json({ ok: false, error: '바코드 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/inventory/items */
export async function createItem(req: Request, res: Response): Promise<void> {
  const { name, type } = req.body;
  if (!name || !type) {
    res.status(400).json({ ok: false, error: 'name과 type은 필수입니다.' });
    return;
  }
  if (!VALID_ITEM_TYPES.includes(type)) {
    res.status(400).json({
      ok: false,
      error: `유효하지 않은 type입니다. 가능한 값: ${VALID_ITEM_TYPES.join(', ')}`,
    });
    return;
  }

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
      res.status(409).json({ ok: false, error: '이미 사용 중인 바코드입니다.' });
      return;
    }
    console.error('[createItem]', err);
    res.status(500).json({ ok: false, error: '아이템 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/inventory/items/:id */
export async function updateItem(req: Request, res: Response): Promise<void> {
  try {
    const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ ok: false, error: '아이템을 찾을 수 없습니다.' }); return; }

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
      res.status(409).json({ ok: false, error: '이미 사용 중인 바코드입니다.' });
      return;
    }
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '아이템을 찾을 수 없습니다.' });
      return;
    }
    console.error('[updateItem]', err);
    res.status(500).json({ ok: false, error: '아이템 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/inventory/items/:id */
export async function deleteItem(req: Request, res: Response): Promise<void> {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
    searchClient.delete(req.params.id);
    res.json({ ok: true, message: '아이템이 삭제되었습니다.', id: req.params.id });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '아이템을 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteItem]', err);
    res.status(500).json({ ok: false, error: '아이템 삭제 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 수량 조정 (입출고)
// ─────────────────────────────────────────────

/** POST /api/inventory/items/:id/quantity */
export async function adjustQuantity(req: Request, res: Response): Promise<void> {
  const { changeType, quantity, reason } = req.body;
  const performedBy = (req.headers['x-user-id'] as string) || 'anonymous';

  if (!changeType || quantity === undefined) {
    res.status(400).json({ ok: false, error: 'changeType과 quantity는 필수입니다.' });
    return;
  }
  if (!['in', 'out', 'adjust'].includes(changeType)) {
    res.status(400).json({ ok: false, error: 'changeType은 in | out | adjust 중 하나여야 합니다.' });
    return;
  }
  if (typeof quantity !== 'number' || quantity < 0) {
    res.status(400).json({ ok: false, error: 'quantity는 0 이상의 숫자여야 합니다.' });
    return;
  }

  try {
    const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!item) { res.status(404).json({ ok: false, error: '아이템을 찾을 수 없습니다.' }); return; }

    const before = item.quantity ?? 0;
    let after: number;
    let delta: number;

    if (changeType === 'in') {
      delta = quantity;
      after = before + quantity;
    } else if (changeType === 'out') {
      if (before < quantity) {
        res.status(400).json({ ok: false, error: `재고 부족: 현재 ${before}${item.unit || ''}, 출고 요청 ${quantity}${item.unit || ''}` });
        return;
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
  } catch (err) {
    console.error('[adjustQuantity]', err);
    res.status(500).json({ ok: false, error: '수량 조정 중 오류가 발생했습니다.' });
  }
}

/** GET /api/inventory/items/:id/history */
export async function getItemHistory(req: Request, res: Response): Promise<void> {
  try {
    const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!item) { res.status(404).json({ ok: false, error: '아이템을 찾을 수 없습니다.' }); return; }

    const history = await prisma.inventoryHistory.findMany({
      where: { itemId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ ok: true, data: history, total: history.length });
  } catch (err) {
    console.error('[getItemHistory]', err);
    res.status(500).json({ ok: false, error: '이력 조회 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 만료 임박 / 재고 부족 알림
// ─────────────────────────────────────────────

/** GET /api/inventory/alerts/expiring — 만료 임박 아이템 */
export async function getExpiringItems(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (err) {
    console.error('[getExpiringItems]', err);
    res.status(500).json({ ok: false, error: '만료 임박 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/inventory/alerts/low-stock — 재고 부족 아이템 */
export async function getLowStockItems(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (err) {
    console.error('[getLowStockItems]', err);
    res.status(500).json({ ok: false, error: '재고 부족 조회 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 카테고리 CRUD
// ─────────────────────────────────────────────

/** GET /api/inventory/categories */
export async function getCategories(_req: Request, res: Response): Promise<void> {
  try {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json({ ok: true, data: categories });
  } catch (err) {
    console.error('[getCategories]', err);
    res.status(500).json({ ok: false, error: '카테고리 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/inventory/categories */
export async function createCategory(req: Request, res: Response): Promise<void> {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ ok: false, error: 'name은 필수입니다.' });
    return;
  }
  try {
    const category = await prisma.category.create({ data: { id: uuidv4(), name: name.trim() } });
    res.status(201).json({ ok: true, data: category });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 존재하는 카테고리입니다.' });
      return;
    }
    console.error('[createCategory]', err);
    res.status(500).json({ ok: false, error: '카테고리 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/inventory/categories/:id */
export async function updateCategory(req: Request, res: Response): Promise<void> {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ ok: false, error: 'name은 필수입니다.' });
    return;
  }
  try {
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
    });
    res.json({ ok: true, data: category });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '카테고리를 찾을 수 없습니다.' });
      return;
    }
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 존재하는 카테고리 이름입니다.' });
      return;
    }
    console.error('[updateCategory]', err);
    res.status(500).json({ ok: false, error: '카테고리 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/inventory/categories/:id */
export async function deleteCategory(req: Request, res: Response): Promise<void> {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '카테고리가 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '카테고리를 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteCategory]', err);
    res.status(500).json({ ok: false, error: '카테고리 삭제 중 오류가 발생했습니다.' });
  }
}
