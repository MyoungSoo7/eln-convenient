import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ErrorCode, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';
import { searchClient } from '../lib/searchClient';

/** GET /api/templates */
export async function listTemplates(request: FastifyRequest, reply: FastifyReply) {
  const { category, search, publicOnly, sortBy, page = '1', limit = '20' } = request.query as Record<string, string>;
  const orgId = getOrgId(request.headers);
  // 자기 조직 템플릿 + 다른 조직의 public 템플릿
  const where: Record<string, unknown> = {
    OR: [{ orgId }, { isPublic: true }],
  };
  if (category)   where.category = category;
  if (publicOnly === 'true') where.isPublic = true;
  if (search) {
    where.AND = [
      { OR: [
        { title:       { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags:        { has: search } },
      ]},
    ];
  }

  // 정렬: useCount(인기순) | createdAt(최신순, 기본)
  const validSortFields: Record<string, object> = {
    useCount:  { useCount: 'desc' },
    copyCount: { copyCount: 'desc' },
    createdAt: { createdAt: 'desc' },
    title:     { title: 'asc' },
  };
  const orderBy = validSortFields[sortBy] ?? { createdAt: 'desc' };

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy,
      skip,
      take: parseInt(limit),
    }),
    prisma.template.count({ where }),
  ]);
  return { ok: true, data: templates, total, page: parseInt(page), limit: parseInt(limit) };
}

/** POST /api/templates */
export async function createTemplate(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const tmpl = await prisma.template.create({
    data: {
      id: uuidv4(),
      orgId: getOrgId(request.headers),
      title: body.title,
      description: body.description || '',
      content: body.content || '',
      category: body.category || '일반',
      sections: body.sections ?? [],
      tags: body.tags || [],
      createdBy: (request.headers['x-user-id'] as string) || 'anonymous',
      isPublic: body.isPublic ?? true,
    },
  });
  searchClient.index({
    id: tmpl.id,
    doc: {
      domainType: 'TEMPLATE',
      title: tmpl.title,
      content: tmpl.content,
      summary: tmpl.description,
      tags: tmpl.tags,
      ownerId: tmpl.createdBy,
      visibility: tmpl.isPublic ? 'public' : 'private',
      docStatus: 'active',
      createdAt: tmpl.createdAt.toISOString(),
      updatedAt: tmpl.updatedAt.toISOString(),
    },
  });
  reply.code(201);
  return { ok: true, data: tmpl };
}

/** GET /api/templates/:id */
export async function getTemplate(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const orgId = getOrgId(request.headers);
  const tmpl = await prisma.template.findFirst({ where: { id, OR: [{ orgId }, { isPublic: true }] } });
  if (!tmpl) throw new AppError(404, '템플릿을 찾을 수 없습니다.', ErrorCode.TEMPLATE_NOT_FOUND);
  return { ok: true, data: tmpl };
}

/** PUT /api/templates/:id */
export async function updateTemplate(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const userId = (request.headers['x-user-id'] as string) || 'anonymous';
  const userRole = request.headers['x-user-role'] as string;

  const existing = await prisma.template.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!existing) throw new AppError(404, '템플릿을 찾을 수 없습니다.', ErrorCode.TEMPLATE_NOT_FOUND);

  // 작성자 또는 admin만 수정 가능
  if (existing.createdBy !== userId && userRole !== 'admin') {
    throw new AppError(403, '템플릿 수정 권한이 없습니다.', ErrorCode.FORBIDDEN);
  }

  const { title, description, content, category, sections, tags, isPublic } = body;
  const updated = await prisma.template.update({
    where: { id },
    data: {
      ...(title       !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(content     !== undefined && { content }),
      ...(category    !== undefined && { category }),
      ...(sections    !== undefined && { sections }),
      ...(tags        !== undefined && { tags }),
      ...(isPublic    !== undefined && { isPublic }),
    },
  });
  searchClient.index({
    id: updated.id,
    doc: {
      domainType: 'TEMPLATE',
      title: updated.title,
      content: updated.content,
      summary: updated.description,
      tags: updated.tags,
      ownerId: updated.createdBy,
      visibility: updated.isPublic ? 'public' : 'private',
      docStatus: 'active',
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
  return { ok: true, data: updated };
}

/** DELETE /api/templates/:id */
export async function deleteTemplate(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request.headers['x-user-id'] as string) || 'anonymous';
  const userRole = request.headers['x-user-role'] as string;

  const existing = await prisma.template.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!existing) throw new AppError(404, '템플릿을 찾을 수 없습니다.', ErrorCode.TEMPLATE_NOT_FOUND);

  if (existing.createdBy !== userId && userRole !== 'admin') {
    throw new AppError(403, '템플릿 삭제 권한이 없습니다.', ErrorCode.FORBIDDEN);
  }

  await prisma.template.delete({ where: { id } });
  searchClient.delete(id);
  return { ok: true, message: '템플릿이 삭제되었습니다.' };
}

/** POST /api/templates/recommend */
export async function recommendTemplates(request: FastifyRequest, reply: FastifyReply) {
  const { category } = request.query as Record<string, string>;
  const orgId = getOrgId(request.headers);
  const templates = await prisma.template.findMany({
    where: {
      OR: [{ orgId }, { isPublic: true }],
      ...(category && { category }),
    },
    take: 5,
    orderBy: { useCount: 'desc' }, // 가장 많이 사용된 템플릿 우선
  });
  return { ok: true, data: templates };
}

// ─────────────────────────────────────────────
// (3) 템플릿 복사
// ─────────────────────────────────────────────

/** POST /api/templates/:id/copy
 *  - 원본 템플릿을 복사해 새 템플릿 생성
 *  - 원본의 copyCount += 1
 *  - 복사본은 비공개(isPublic=false), copiedFromId에 원본 ID 기록
 */
export async function copyTemplate(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request.headers['x-user-id'] as string) || 'anonymous';

  const orgId = getOrgId(request.headers);
  const original = await prisma.template.findFirst({ where: { id, OR: [{ orgId }, { isPublic: true }] } });
  if (!original) {
    throw new AppError(404, '원본 템플릿을 찾을 수 없습니다.', ErrorCode.TEMPLATE_NOT_FOUND);
  }

  // 복사본 생성 + 원본 copyCount 증가를 트랜잭션으로 처리
  const [copied] = await prisma.$transaction([
    prisma.template.create({
      data: {
        id: uuidv4(),
        orgId: getOrgId(request.headers),
        title:        `${original.title} (복사본)`,
        description:  original.description,
        content:      original.content,
        category:     original.category,
        sections:     original.sections ?? [],
        tags:         original.tags,
        createdBy:    userId,
        isPublic:     false,      // 복사본은 기본 비공개
        useCount:     0,          // 복사본은 사용 횟수 초기화
        copyCount:    0,
        copiedFromId: original.id,
      },
    }),
    prisma.template.update({
      where: { id: original.id },
      data:  { copyCount: { increment: 1 } },
    }),
  ]);

  reply.code(201);
  return { ok: true, data: copied, originalId: original.id };
}
