import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

const VALID_DOC_TYPES = ['notes', 'templates', 'inventory'] as const;

/** POST /api/search/favorites — 즐겨찾기 추가 */
export async function addFavorite(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  const { docType, docId, title } = req.body;

  if (!docType || !docId || !title) {
    res.status(400).json({ ok: false, error: 'docType, docId, title은 필수입니다.' });
    return;
  }
  if (!VALID_DOC_TYPES.includes(docType)) {
    res.status(400).json({
      ok: false,
      error: `유효하지 않은 docType입니다. 가능한 값: ${VALID_DOC_TYPES.join(', ')}`,
    });
    return;
  }

  try {
    const favorite = await prisma.favorite.create({
      data: { id: uuidv4(), userId, docType, docId, title },
    });
    res.status(201).json({ ok: true, data: favorite });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 즐겨찾기에 추가된 항목입니다.' });
      return;
    }
    console.error('[addFavorite]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 추가 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/search/favorites/:id — 즐겨찾기 제거 */
export async function removeFavorite(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;

  try {
    const favorite = await prisma.favorite.findUnique({ where: { id: req.params.id } });
    if (!favorite) {
      res.status(404).json({ ok: false, error: '즐겨찾기를 찾을 수 없습니다.' });
      return;
    }
    if (favorite.userId !== userId) {
      res.status(403).json({ ok: false, error: '본인의 즐겨찾기만 삭제할 수 있습니다.' });
      return;
    }

    await prisma.favorite.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '즐겨찾기가 제거되었습니다.', id: req.params.id });
  } catch (err) {
    console.error('[removeFavorite]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 제거 중 오류가 발생했습니다.' });
  }
}

/** GET /api/search/favorites — 사용자별 즐겨찾기 목록 */
export async function getFavorites(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  const docType = req.query.docType as string | undefined;

  try {
    // Prisma 타입 호환을 위해 명시적 타입 사용
    const where: { userId: string; docType?: string } = { userId };
    if (docType) where.docType = docType;

    const favorites = await prisma.favorite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, data: favorites, total: favorites.length });
  } catch (err) {
    console.error('[getFavorites]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 조회 중 오류가 발생했습니다.' });
  }
}
