import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { AppError, ErrorCode, createLogger, getOrgId } from '@lab/shared';

const logger = createLogger('search-service');

/** POST /api/search/keyword-favorites */
export async function addKeywordFavorite(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.headers['x-user-id'] as string)?.trim();
  const { keyword } = request.body as { keyword: string };

  try {
    const fav = await prisma.searchKeywordFavorite.create({
      data: { id: uuidv4(), userId, orgId: getOrgId(request.headers), keyword: keyword.trim() },
    });
    reply.code(201);
    return { ok: true, data: fav };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 즐겨찾기에 추가된 검색어입니다.', ErrorCode.SEARCH_FAVORITE_EXISTS);
    }
    logger.error({ err }, '즐겨찾기 추가 중 오류');
    throw err;
  }
}

/** GET /api/search/keyword-favorites */
export async function getKeywordFavorites(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.headers['x-user-id'] as string)?.trim();

  const favorites = await prisma.searchKeywordFavorite.findMany({
    where: { userId, orgId: getOrgId(request.headers) },
    orderBy: { createdAt: 'desc' },
  });
  return { ok: true, data: favorites, total: favorites.length };
}

/** DELETE /api/search/keyword-favorites/:id */
export async function removeKeywordFavorite(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.headers['x-user-id'] as string)?.trim();
  const { id } = request.params as { id: string };

  const fav = await prisma.searchKeywordFavorite.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!fav) {
    throw new AppError(404, '즐겨찾기를 찾을 수 없습니다.', ErrorCode.SEARCH_FAVORITE_NOT_FOUND);
  }
  if (fav.userId !== userId) {
    throw new AppError(403, '본인의 즐겨찾기만 삭제할 수 있습니다.', ErrorCode.SEARCH_PERMISSION_DENIED);
  }
  await prisma.searchKeywordFavorite.delete({ where: { id } });
  return { ok: true, message: '즐겨찾기 검색어가 삭제되었습니다.', id };
}
