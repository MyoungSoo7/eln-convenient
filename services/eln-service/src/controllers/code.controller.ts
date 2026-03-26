import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ErrorCode, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';

/** GET /api/codes?group=TEMPLATE_CATEGORY */
export async function listCodes(request: FastifyRequest, reply: FastifyReply) {
  const { group } = request.query as Record<string, string>;
  const orgId = getOrgId(request.headers);

  const where: Record<string, unknown> = { orgId, isActive: true };
  if (group) where.group = group;

  const codes = await prisma.code.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
  });

  return {
    ok: true,
    data: codes.map((c) => ({
      id: c.id,
      group: c.group,
      value: c.value,
      label: c.label ?? c.value,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    })),
  };
}

/** GET /api/codes/groups — 전체 그룹 목록 */
export async function listGroups(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request.headers);
  const groups = await prisma.code.groupBy({
    by: ['group'],
    where: { orgId },
    _count: { id: true },
  });
  return {
    ok: true,
    data: groups.map((g) => ({ group: g.group, count: g._count.id })),
  };
}

/** POST /api/codes */
export async function createCode(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const { group, value, label, sortOrder } = body;
  const orgId = getOrgId(request.headers);

  if (!group || !value) {
    throw new AppError(400, 'group과 value는 필수입니다.', ErrorCode.VALIDATION_ERROR);
  }

  try {
    const code = await prisma.code.create({
      data: {
        id: uuidv4(),
        group,
        value,
        label: label || null,
        sortOrder: sortOrder ?? 0,
        orgId,
      },
    });
    reply.code(201);
    return { ok: true, data: code };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 존재하는 코드입니다.', ErrorCode.VALIDATION_ERROR);
    }
    throw err;
  }
}

/** PUT /api/codes/:id */
export async function updateCode(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const { value, label, sortOrder, isActive } = body;
  const orgId = getOrgId(request.headers);

  try {
    const code = await prisma.code.update({
      where: { id },
      data: {
        ...(value !== undefined && { value }),
        ...(label !== undefined && { label: label || null }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    if (code.orgId !== orgId) {
      throw new AppError(403, '권한이 없습니다.', ErrorCode.FORBIDDEN);
    }

    return { ok: true, data: code };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '코드를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
    }
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 존재하는 코드입니다.', ErrorCode.VALIDATION_ERROR);
    }
    throw err;
  }
}

/** DELETE /api/codes/:id */
export async function deleteCode(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const orgId = getOrgId(request.headers);

  const code = await prisma.code.findUnique({ where: { id } });
  if (!code) throw new AppError(404, '코드를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
  if (code.orgId !== orgId) throw new AppError(403, '권한이 없습니다.', ErrorCode.FORBIDDEN);

  await prisma.code.delete({ where: { id } });
  return { ok: true, message: '코드가 삭제되었습니다.' };
}
