import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler, ErrorCode, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';

/** GET /api/codes?group=TEMPLATE_CATEGORY */
export const listCodes = asyncHandler(async (req: Request, res: Response) => {
  const { group } = req.query;
  const orgId = getOrgId(req);

  const where: Record<string, unknown> = { orgId, isActive: true };
  if (group) where.group = group as string;

  const codes = await prisma.code.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
  });

  res.json({
    ok: true,
    data: codes.map((c) => ({
      id: c.id,
      group: c.group,
      value: c.value,
      label: c.label ?? c.value,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    })),
  });
});

/** GET /api/codes/groups — 전체 그룹 목록 */
export const listGroups = asyncHandler(async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const groups = await prisma.code.groupBy({
    by: ['group'],
    where: { orgId },
    _count: { id: true },
  });
  res.json({
    ok: true,
    data: groups.map((g) => ({ group: g.group, count: g._count.id })),
  });
});

/** POST /api/codes */
export const createCode = asyncHandler(async (req: Request, res: Response) => {
  const { group, value, label, sortOrder } = req.body;
  const orgId = getOrgId(req);

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
    res.status(201).json({ ok: true, data: code });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 존재하는 코드입니다.', ErrorCode.VALIDATION_ERROR);
    }
    throw err;
  }
});

/** PUT /api/codes/:id */
export const updateCode = asyncHandler(async (req: Request, res: Response) => {
  const { value, label, sortOrder, isActive } = req.body;
  const orgId = getOrgId(req);

  try {
    const code = await prisma.code.update({
      where: { id: req.params.id },
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

    res.json({ ok: true, data: code });
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
});

/** DELETE /api/codes/:id */
export const deleteCode = asyncHandler(async (req: Request, res: Response) => {
  const orgId = getOrgId(req);

  const code = await prisma.code.findUnique({ where: { id: req.params.id } });
  if (!code) throw new AppError(404, '코드를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
  if (code.orgId !== orgId) throw new AppError(403, '권한이 없습니다.', ErrorCode.FORBIDDEN);

  await prisma.code.delete({ where: { id: req.params.id } });
  res.json({ ok: true, message: '코드가 삭제되었습니다.' });
});
