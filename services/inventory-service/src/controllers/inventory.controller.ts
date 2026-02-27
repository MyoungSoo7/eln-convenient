import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { IInventoryItem } from '../interfaces/inventory.interface';

const DUMMY_ITEMS: IInventoryItem[] = [
  { id: 'item-001', name: 'Taq DNA Polymerase', type: 'reagent', status: 'available', category: '효소', location: 'A동 301호 냉장고 #2', barcode: 'RGT-2024-001', quantity: 500, unit: 'units', metadata: { manufacturer: 'Thermo Fisher', catalogNo: 'EP0402' }, tags: ['PCR', '효소'], createdBy: 'dev-user-001', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-10T00:00:00Z' },
  { id: 'item-002', name: 'HeLa 세포주', type: 'cell_line', status: 'in_use', category: '세포주', location: 'B동 배양실 인큐베이터 #1', quantity: 3, unit: 'flask', metadata: { passage: 15, origin: 'ATCC' }, tags: ['세포배양'], createdBy: 'dev-user-001', createdAt: '2024-01-05T00:00:00Z', updatedAt: '2024-01-15T00:00:00Z' },
  { id: 'item-003', name: 'PCR Thermocycler', type: 'equipment', status: 'available', category: '장비', location: 'A동 302호', barcode: 'EQP-2024-001', metadata: { model: 'T100', manufacturer: 'Bio-Rad' }, tags: ['PCR', '장비'], createdBy: 'dev-user-001', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

export function getItems(req: Request, res: Response): void {
  let items = DUMMY_ITEMS;
  if (req.query.type) items = items.filter((i) => i.type === req.query.type);
  if (req.query.status) items = items.filter((i) => i.status === req.query.status);
  res.json({ data: items, total: items.length });
}

export function getItemById(req: Request, res: Response): void {
  const item = DUMMY_ITEMS.find((i) => i.id === req.params.id);
  if (!item) { res.status(404).json({ error: '아이템을 찾을 수 없습니다.' }); return; }
  res.json(item);
}

export function createItem(req: Request, res: Response): void {
  const item: IInventoryItem = {
    id: uuidv4(), ...req.body, status: 'available', metadata: req.body.metadata || {},
    tags: req.body.tags || [], createdBy: req.headers['x-user-id'] as string || 'dev-user-001',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  res.status(201).json(item);
}

export function updateItem(req: Request, res: Response): void {
  const item = DUMMY_ITEMS.find((i) => i.id === req.params.id);
  if (!item) { res.status(404).json({ error: '아이템을 찾을 수 없습니다.' }); return; }
  res.json({ ...item, ...req.body, updatedAt: new Date().toISOString() });
}

export function deleteItem(req: Request, res: Response): void {
  res.json({ message: '아이템이 삭제되었습니다.', id: req.params.id });
}

export function getCategories(_req: Request, res: Response): void {
  res.json([
    { id: 'cat-001', name: '효소' },
    { id: 'cat-002', name: '세포주' },
    { id: 'cat-003', name: '항체' },
    { id: 'cat-004', name: '장비' },
    { id: 'cat-005', name: '소모품' },
  ]);
}
