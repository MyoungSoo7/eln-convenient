import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { AppError, asyncHandler, ErrorCode, createLogger } from '@lab/shared';

const logger = createLogger('search-service');

/** POST /api/search/history — 검색어 저장 */
export const saveHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.headers['x-user-id'] as string;
  const { query } = req.body;

  const entry = await prisma.searchHistory.create({
    data: { id: uuidv4(), userId, query: query.trim() },
  });
  res.status(201).json({ ok: true, data: entry });
});

/** GET /api/search/history — 사용자별 최근 검색어 (최근 20개) */
export const getHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.headers['x-user-id'] as string;

  const history = await prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({ ok: true, data: history, total: history.length });
});

/** DELETE /api/search/history/:id — 특정 검색어 삭제 */
export const deleteHistoryEntry = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.headers['x-user-id'] as string;

  const entry = await prisma.searchHistory.findUnique({ where: { id: req.params.id } });
  if (!entry) {
    throw new AppError(404, '검색 기록을 찾을 수 없습니다.', ErrorCode.SEARCH_HISTORY_NOT_FOUND);
  }
  if (entry.userId !== userId) {
    throw new AppError(403, '본인의 검색 기록만 삭제할 수 있습니다.', ErrorCode.SEARCH_PERMISSION_DENIED);
  }

  await prisma.searchHistory.delete({ where: { id: req.params.id } });
  res.json({ ok: true, message: '검색 기록이 삭제되었습니다.', id: req.params.id });
});

/** DELETE /api/search/history — 사용자 전체 검색 기록 삭제 */
export const clearHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.headers['x-user-id'] as string;

  const { count } = await prisma.searchHistory.deleteMany({ where: { userId } });
  res.json({ ok: true, message: `검색 기록 ${count}건이 삭제되었습니다.`, count });
});
