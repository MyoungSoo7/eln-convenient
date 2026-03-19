import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

/** POST /api/search/keyword-favorites */
export async function addKeywordFavorite(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string)?.trim();
  const { keyword } = req.body;

  try {
    const fav = await prisma.searchKeywordFavorite.create({
      data: { id: uuidv4(), userId, keyword: keyword.trim() },
    });
    res.status(201).json({ ok: true, data: fav });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 즐겨찾기에 추가된 검색어입니다.' });
      return;
    }
    console.error('[addKeywordFavorite]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 추가 중 오류가 발생했습니다.' });
  }
}

/** GET /api/search/keyword-favorites */
export async function getKeywordFavorites(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string)?.trim();

  try {
    const favorites = await prisma.searchKeywordFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, data: favorites, total: favorites.length });
  } catch (err) {
    console.error('[getKeywordFavorites]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 조회 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/search/keyword-favorites/:id */
export async function removeKeywordFavorite(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string)?.trim();

  try {
    const fav = await prisma.searchKeywordFavorite.findUnique({ where: { id: req.params.id } });
    if (!fav) {
      res.status(404).json({ ok: false, error: '즐겨찾기를 찾을 수 없습니다.' });
      return;
    }
    if (fav.userId !== userId) {
      res.status(403).json({ ok: false, error: '본인의 즐겨찾기만 삭제할 수 있습니다.' });
      return;
    }
    await prisma.searchKeywordFavorite.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '즐겨찾기 검색어가 삭제되었습니다.', id: req.params.id });
  } catch (err) {
    console.error('[removeKeywordFavorite]', err);
    res.status(500).json({ ok: false, error: '즐겨찾기 삭제 중 오류가 발생했습니다.' });
  }
}
