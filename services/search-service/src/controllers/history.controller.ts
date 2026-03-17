import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

/** POST /api/search/history — 검색어 저장 */
export async function saveHistory(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  const { query } = req.body;

  if (!query?.trim()) {
    res.status(400).json({ ok: false, error: 'query는 필수입니다.' });
    return;
  }

  try {
    const entry = await prisma.searchHistory.create({
      data: { id: uuidv4(), userId, query: query.trim() },
    });
    res.status(201).json({ ok: true, data: entry });
  } catch (err) {
    console.error('[saveHistory]', err);
    res.status(500).json({ ok: false, error: '검색어 저장 중 오류가 발생했습니다.' });
  }
}

/** GET /api/search/history — 사용자별 최근 검색어 (최근 20개) */
export async function getHistory(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;

  try {
    const history = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ ok: true, data: history, total: history.length });
  } catch (err) {
    console.error('[getHistory]', err);
    res.status(500).json({ ok: false, error: '검색 히스토리 조회 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/search/history/:id — 특정 검색어 삭제 */
export async function deleteHistoryEntry(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;

  try {
    const entry = await prisma.searchHistory.findUnique({ where: { id: req.params.id } });
    if (!entry) {
      res.status(404).json({ ok: false, error: '검색 기록을 찾을 수 없습니다.' });
      return;
    }
    if (entry.userId !== userId) {
      res.status(403).json({ ok: false, error: '본인의 검색 기록만 삭제할 수 있습니다.' });
      return;
    }

    await prisma.searchHistory.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '검색 기록이 삭제되었습니다.', id: req.params.id });
  } catch (err) {
    console.error('[deleteHistoryEntry]', err);
    res.status(500).json({ ok: false, error: '검색 기록 삭제 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/search/history — 사용자 전체 검색 기록 삭제 */
export async function clearHistory(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;

  try {
    const { count } = await prisma.searchHistory.deleteMany({ where: { userId } });
    res.json({ ok: true, message: `검색 기록 ${count}건이 삭제되었습니다.`, count });
  } catch (err) {
    console.error('[clearHistory]', err);
    res.status(500).json({ ok: false, error: '검색 기록 전체 삭제 중 오류가 발생했습니다.' });
  }
}
