import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { AppError, asyncHandler, ErrorCode, createLogger } from '@lab/shared';

const logger = createLogger('search-service');

/** POST /api/search/keyword-favorites */
export const addKeywordFavorite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req.headers['x-user-id'] as string)?.trim();
  const { keyword } = req.body;

  try {
    const fav = await prisma.searchKeywordFavorite.create({
      data: { id: uuidv4(), userId, keyword: keyword.trim() },
    });
    res.status(201).json({ ok: true, data: fav });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 즐겨찾기에 추가된 검색어입니다.', ErrorCode.SEARCH_FAVORITE_EXISTS);
    }
    logger.error({ err }, '즐겨찾기 추가 중 오류');
    throw err;
  }
});

/** GET /api/search/keyword-favorites */
export const getKeywordFavorites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req.headers['x-user-id'] as string)?.trim();

  const favorites = await prisma.searchKeywordFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ ok: true, data: favorites, total: favorites.length });
});

/** DELETE /api/search/keyword-favorites/:id */
export const removeKeywordFavorite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req.headers['x-user-id'] as string)?.trim();

  const fav = await prisma.searchKeywordFavorite.findUnique({ where: { id: req.params.id } });
  if (!fav) {
    throw new AppError(404, '즐겨찾기를 찾을 수 없습니다.', ErrorCode.SEARCH_FAVORITE_NOT_FOUND);
  }
  if (fav.userId !== userId) {
    throw new AppError(403, '본인의 즐겨찾기만 삭제할 수 있습니다.', ErrorCode.SEARCH_PERMISSION_DENIED);
  }
  await prisma.searchKeywordFavorite.delete({ where: { id: req.params.id } });
  res.json({ ok: true, message: '즐겨찾기 검색어가 삭제되었습니다.', id: req.params.id });
});
