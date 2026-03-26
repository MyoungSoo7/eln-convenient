import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { AppError, ErrorCode, createLogger, getOrgId } from '@lab/shared';

const logger = createLogger('search-service');

/** POST /api/search/favorites — 즐겨찾기 추가 */
export async function addFavorite(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.headers['x-user-id'] as string;
  const { docType, docId, title } = request.body as any;

  try {
    const favorite = await prisma.favorite.create({
      data: { id: uuidv4(), userId, orgId: getOrgId(request.headers), docType, docId, title },
    });
    reply.code(201);
    return { ok: true, data: favorite };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 즐겨찾기에 추가된 항목입니다.', ErrorCode.SEARCH_FAVORITE_EXISTS);
    }
    logger.error({ err }, '즐겨찾기 추가 중 오류');
    throw err;
  }
}

/** DELETE /api/search/favorites/:id — 즐겨찾기 제거 */
export async function removeFavorite(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.headers['x-user-id'] as string;
  const { id } = request.params as { id: string };

  const favorite = await prisma.favorite.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!favorite) {
    throw new AppError(404, '즐겨찾기를 찾을 수 없습니다.', ErrorCode.SEARCH_FAVORITE_NOT_FOUND);
  }
  if (favorite.userId !== userId) {
    throw new AppError(403, '본인의 즐겨찾기만 삭제할 수 있습니다.', ErrorCode.SEARCH_PERMISSION_DENIED);
  }

  await prisma.favorite.delete({ where: { id } });
  return { ok: true, message: '즐겨찾기가 제거되었습니다.', id };
}

/** GET /api/search/favorites — 사용자별 즐겨찾기 목록 */
export async function getFavorites(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.headers['x-user-id'] as string;
  const { docType } = request.query as { docType?: string };

  const where: { userId: string; orgId: string; docType?: string } = { userId, orgId: getOrgId(request.headers) };
  if (docType) where.docType = docType;

  const favorites = await prisma.favorite.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  return { ok: true, data: favorites, total: favorites.length };
}
