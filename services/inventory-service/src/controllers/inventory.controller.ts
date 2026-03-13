import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

export async function getItems(req: Request, res: Response): Promise<void> {
  const { type, status, category, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (category) where.category = category;

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  res.json({ data: items, total });
}

export async function getItemById(req: Request, res: Response): Promise<void> {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) { res.status(404).json({ error: '아이템을 찾을 수 없습니다.' }); return; }
  res.json(item);
}

export async function createItem(req: Request, res: Response): Promise<void> {
  const item = await prisma.inventoryItem.create({
    data: {
      id: uuidv4(),
      name: req.body.name,
      type: req.body.type,
      status: 'available',
      category: req.body.category || null,
      location: req.body.location || null,
      barcode: req.body.barcode || null,
      quantity: req.body.quantity ?? null,
      unit: req.body.unit || null,
      metadata: req.body.metadata || {},
      tags: req.body.tags || [],
      createdBy: req.headers['x-user-id'] as string || 'anonymous',
    },
  });
  res.status(201).json(item);
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: '아이템을 찾을 수 없습니다.' }); return; }

  const item = await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data: {
      ...(req.body.name && { name: req.body.name }),
      ...(req.body.type && { type: req.body.type }),
      ...(req.body.status && { status: req.body.status }),
      ...(req.body.category !== undefined && { category: req.body.category }),
      ...(req.body.location !== undefined && { location: req.body.location }),
      ...(req.body.barcode !== undefined && { barcode: req.body.barcode }),
      ...(req.body.quantity !== undefined && { quantity: req.body.quantity }),
      ...(req.body.unit !== undefined && { unit: req.body.unit }),
      ...(req.body.metadata && { metadata: req.body.metadata }),
      ...(req.body.tags && { tags: req.body.tags }),
    },
  });
  res.json(item);
}

export async function deleteItem(req: Request, res: Response): Promise<void> {
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.json({ message: '아이템이 삭제되었습니다.', id: req.params.id });
}

export async function getCategories(_req: Request, res: Response): Promise<void> {
  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  res.json(categories);
}
