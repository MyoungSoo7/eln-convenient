import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

export async function listTemplates(_req: Request, res: Response): Promise<void> {
  const templates = await prisma.template.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ ok: true, data: templates });
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const tmpl = await prisma.template.create({
    data: {
      id: uuidv4(),
      title: req.body.title || req.body.name,
      description: req.body.description || '',
      content: req.body.content || '',
      category: req.body.category || '기본',
      sections: req.body.sections || [],
      tags: req.body.tags || [],
      createdBy: req.headers['x-user-id'] as string || 'anonymous',
      isPublic: req.body.isPublic ?? true,
    },
  });
  res.status(201).json({ ok: true, data: tmpl });
}

export async function getTemplate(req: Request, res: Response): Promise<void> {
  const tmpl = await prisma.template.findUnique({ where: { id: req.params.id } });
  if (!tmpl) { res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }); return; }
  res.json({ ok: true, data: tmpl });
}

export async function recommendTemplates(req: Request, res: Response): Promise<void> {
  const { category } = req.query;
  const templates = await prisma.template.findMany({
    where: {
      isPublic: true,
      ...(category && { category: category as string }),
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ ok: true, data: templates });
}
