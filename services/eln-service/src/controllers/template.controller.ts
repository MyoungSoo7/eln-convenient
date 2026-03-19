import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { searchClient } from '../lib/searchClient';

/** GET /api/templates */
export async function listTemplates(req: Request, res: Response): Promise<void> {
  const { category, search, publicOnly, sortBy, page = '1', limit = '20' } = req.query;
  const where: Record<string, unknown> = {};
  if (category)   where.category = category;
  if (publicOnly === 'true') where.isPublic = true;
  if (search) {
    where.OR = [
      { title:       { contains: search as string, mode: 'insensitive' } },
      { description: { contains: search as string, mode: 'insensitive' } },
      { tags:        { has: search as string } },
    ];
  }

  // 정렬: useCount(인기순) | createdAt(최신순, 기본)
  const validSortFields: Record<string, object> = {
    useCount:  { useCount: 'desc' },
    copyCount: { copyCount: 'desc' },
    createdAt: { createdAt: 'desc' },
    title:     { title: 'asc' },
  };
  const orderBy = validSortFields[sortBy as string] ?? { createdAt: 'desc' };

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy,
        skip,
        take: parseInt(limit as string),
      }),
      prisma.template.count({ where }),
    ]);
    res.json({ ok: true, data: templates, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err) {
    console.error('[listTemplates]', err);
    res.status(500).json({ ok: false, error: '템플릿 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/templates */
export async function createTemplate(req: Request, res: Response): Promise<void> {
  try {
    const tmpl = await prisma.template.create({
      data: {
        id: uuidv4(),
        title: req.body.title,
        description: req.body.description || '',
        content: req.body.content || '',
        category: req.body.category || '일반',
        sections: req.body.sections ?? [],
        tags: req.body.tags || [],
        createdBy: (req.headers['x-user-id'] as string) || 'anonymous',
        isPublic: req.body.isPublic ?? true,
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
    res.status(201).json({ ok: true, data: tmpl });
  } catch (err) {
    console.error('[createTemplate]', err);
    res.status(500).json({ ok: false, error: '템플릿 생성 중 오류가 발생했습니다.' });
  }
}

/** GET /api/templates/:id */
export async function getTemplate(req: Request, res: Response): Promise<void> {
  try {
    const tmpl = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!tmpl) { res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }); return; }
    res.json({ ok: true, data: tmpl });
  } catch (err) {
    console.error('[getTemplate]', err);
    res.status(500).json({ ok: false, error: '템플릿 조회 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/templates/:id */
export async function updateTemplate(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';
  const userRole = req.headers['x-user-role'] as string;

  try {
    const existing = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }); return; }

    // 작성자 또는 admin만 수정 가능
    if (existing.createdBy !== userId && userRole !== 'admin') {
      res.status(403).json({ ok: false, error: '템플릿 수정 권한이 없습니다.' });
      return;
    }

    const { title, description, content, category, sections, tags, isPublic } = req.body;
    const updated = await prisma.template.update({
      where: { id: req.params.id },
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
    res.json({ ok: true, data: updated });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' });
      return;
    }
    console.error('[updateTemplate]', err);
    res.status(500).json({ ok: false, error: '템플릿 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/templates/:id */
export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';
  const userRole = req.headers['x-user-role'] as string;

  try {
    const existing = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }); return; }

    if (existing.createdBy !== userId && userRole !== 'admin') {
      res.status(403).json({ ok: false, error: '템플릿 삭제 권한이 없습니다.' });
      return;
    }

    await prisma.template.delete({ where: { id: req.params.id } });
    searchClient.delete(req.params.id);
    res.json({ ok: true, message: '템플릿이 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteTemplate]', err);
    res.status(500).json({ ok: false, error: '템플릿 삭제 중 오류가 발생했습니다.' });
  }
}

/** POST /api/templates/recommend */
export async function recommendTemplates(req: Request, res: Response): Promise<void> {
  const { category } = req.query;
  try {
    const templates = await prisma.template.findMany({
      where: {
        isPublic: true,
        ...(category && { category: category as string }),
      },
      take: 5,
      orderBy: { useCount: 'desc' }, // 가장 많이 사용된 템플릿 우선
    });
    res.json({ ok: true, data: templates });
  } catch (err) {
    console.error('[recommendTemplates]', err);
    res.status(500).json({ ok: false, error: '추천 템플릿 조회 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// (3) 템플릿 복사
// ─────────────────────────────────────────────

/** POST /api/templates/:id/copy
 *  - 원본 템플릿을 복사해 새 템플릿 생성
 *  - 원본의 copyCount += 1
 *  - 복사본은 비공개(isPublic=false), copiedFromId에 원본 ID 기록
 */
export async function copyTemplate(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';

  try {
    const original = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!original) {
      res.status(404).json({ ok: false, error: '원본 템플릿을 찾을 수 없습니다.' });
      return;
    }

    // 복사본 생성 + 원본 copyCount 증가를 트랜잭션으로 처리
    const [copied] = await prisma.$transaction([
      prisma.template.create({
        data: {
          id: uuidv4(),
          title:        `${original.title} (복사본)`,
          description:  original.description,
          content:      original.content,
          category:     original.category,
          sections:     original.sections as object,
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

    res.status(201).json({ ok: true, data: copied, originalId: original.id });
  } catch (err) {
    console.error('[copyTemplate]', err);
    res.status(500).json({ ok: false, error: '템플릿 복사 중 오류가 발생했습니다.' });
  }
}
