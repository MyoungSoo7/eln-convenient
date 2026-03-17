import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

/** GET /api/templates */
export async function listTemplates(req: Request, res: Response): Promise<void> {
  const { category, search, publicOnly } = req.query;
  const where: Record<string, unknown> = {};
  if (category)   where.category = category;
  if (publicOnly === 'true') where.isPublic = true;
  if (search) {
    where.OR = [
      { title:       { contains: search as string, mode: 'insensitive' } },
      { description: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  try {
    const templates = await prisma.template.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ ok: true, data: templates, total: templates.length });
  } catch (err) {
    console.error('[listTemplates]', err);
    res.status(500).json({ ok: false, error: '템플릿 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/templates */
export async function createTemplate(req: Request, res: Response): Promise<void> {
  if (!req.body.title) {
    res.status(400).json({ ok: false, error: 'title은 필수입니다.' });
    return;
  }
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
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, data: templates });
  } catch (err) {
    console.error('[recommendTemplates]', err);
    res.status(500).json({ ok: false, error: '추천 템플릿 조회 중 오류가 발생했습니다.' });
  }
}
