import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

export async function exportPdf(req: Request, res: Response): Promise<void> {
  const job = await prisma.exportJob.create({
    data: {
      id: uuidv4(),
      noteId: req.params.noteId,
      format: 'pdf',
      status: 'pending',
    },
  });
  res.status(202).json({ ok: true, data: { jobId: job.id, noteId: job.noteId, status: job.status, message: 'PDF 내보내기 작업이 대기열에 추가되었습니다.' } });
}

export async function getExportStatus(req: Request, res: Response): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) { res.status(404).json({ ok: false, error: '작업을 찾을 수 없습니다.' }); return; }
  res.json({ ok: true, data: { jobId: job.id, status: job.status, downloadUrl: job.fileUrl, completedAt: job.completedAt } });
}

export async function exportZip(_req: Request, res: Response): Promise<void> {
  const job = await prisma.exportJob.create({
    data: {
      id: uuidv4(),
      noteId: 'bulk',
      format: 'zip',
      status: 'pending',
    },
  });
  res.status(202).json({ ok: true, data: { jobId: job.id, status: job.status, message: 'ZIP 내보내기 작업이 대기열에 추가되었습니다.' } });
}
