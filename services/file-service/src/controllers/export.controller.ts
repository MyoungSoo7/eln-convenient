// services/file-service/src/controllers/export.controller.ts
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { jobQueue } from '../lib/jobWorker';

// ─── POST /api/exports/pdf ───────────────────────────────────────
export async function createPdfExport(req: Request, res: Response): Promise<void> {
  const { noteId } = req.body;
  if (!noteId) {
    res.status(400).json({ ok: false, error: 'noteId가 필요합니다.' });
    return;
  }
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.create({
      data: {
        type: 'pdf',
        status: 'PENDING',
        requestedBy,
        params: { noteId },
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h
      },
    });
    jobQueue.push(job.id);
    res.status(202).json({ ok: true, data: toDto(job) });
  } catch (err) {
    console.error('[export] PDF job 생성 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 생성에 실패했습니다.' });
  }
}

// ─── POST /api/exports/zip ───────────────────────────────────────
export async function createZipExport(req: Request, res: Response): Promise<void> {
  const { scope, projectId, noteIds } = req.body;
  if (!scope || !['all', 'project', 'selected'].includes(scope)) {
    res.status(400).json({ ok: false, error: 'scope는 all | project | selected 중 하나입니다.' });
    return;
  }
  if (scope === 'project' && !projectId) {
    res.status(400).json({ ok: false, error: 'scope=project 이면 projectId가 필요합니다.' });
    return;
  }
  if (scope === 'selected' && (!Array.isArray(noteIds) || noteIds.length === 0)) {
    res.status(400).json({ ok: false, error: 'scope=selected 이면 noteIds 배열이 필요합니다.' });
    return;
  }
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.create({
      data: {
        type: 'zip',
        status: 'PENDING',
        requestedBy,
        params: { scope, projectId: projectId || null, noteIds: noteIds || null },
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });
    jobQueue.push(job.id);
    res.status(202).json({ ok: true, data: toDto(job) });
  } catch (err) {
    console.error('[export] ZIP job 생성 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 생성에 실패했습니다.' });
  }
}

// ─── GET /api/exports ────────────────────────────────────────────
export async function listExports(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  const { status, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  try {
    const where = {
      requestedBy,
      ...(status ? { status: status as string } : {}),
    };
    const [jobs, total] = await Promise.all([
      prisma.exportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.exportJob.count({ where }),
    ]);
    res.json({ ok: true, data: jobs.map(toDto), total, page: parseInt(page as string) });
  } catch (err) {
    console.error('[export] 목록 조회 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 목록 조회에 실패했습니다.' });
  }
}

// ─── GET /api/exports/:jobId ─────────────────────────────────────
export async function getExport(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.findFirst({
      where: { id: req.params.jobId, requestedBy },
    });
    if (!job) { res.status(404).json({ ok: false, error: 'Export job을 찾을 수 없습니다.' }); return; }
    res.json({ ok: true, data: toDto(job) });
  } catch (err) {
    console.error('[export] 조회 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 조회에 실패했습니다.' });
  }
}

// ─── GET /api/exports/:jobId/download ───────────────────────────
export async function downloadExport(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.findFirst({
      where: { id: req.params.jobId, requestedBy },
      include: { resultFile: true },
    });
    if (!job) { res.status(404).json({ ok: false, error: 'Export job을 찾을 수 없습니다.' }); return; }
    if (job.status !== 'COMPLETED' || !job.resultFile) {
      res.status(409).json({ ok: false, error: `Export가 완료되지 않았습니다. 현재 상태: ${job.status}` });
      return;
    }
    const { getPresignedUrlFromBucket } = await import('../lib/minio');
    const url = await getPresignedUrlFromBucket(job.resultFile.bucket, job.resultFile.objectKey, 300);
    res.redirect(url);
  } catch (err) {
    console.error('[export] download 실패:', err);
    res.status(502).json({ ok: false, error: '다운로드 URL 생성에 실패했습니다.' });
  }
}

// ─── DELETE /api/exports/:jobId ──────────────────────────────────
export async function cancelExport(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.findFirst({
      where: { id: req.params.jobId, requestedBy },
    });
    if (!job) { res.status(404).json({ ok: false, error: 'Export job을 찾을 수 없습니다.' }); return; }
    if (!['PENDING', 'FAILED'].includes(job.status)) {
      res.status(409).json({ ok: false, error: `${job.status} 상태의 job은 취소할 수 없습니다.` });
      return;
    }
    await prisma.exportJob.delete({ where: { id: job.id } });
    res.json({ ok: true, message: 'Export job이 취소되었습니다.' });
  } catch (err) {
    console.error('[export] 취소 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 취소에 실패했습니다.' });
  }
}

// ─── DTO 변환 ────────────────────────────────────────────────────
function toDto(job: {
  id: string; type: string; status: string; requestedBy: string;
  params: unknown; resultFileId: string | null; errorMessage: string | null;
  retryCount: number; startedAt: Date | null; completedAt: Date | null;
  expiresAt: Date | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    params: job.params,
    resultFileId: job.resultFileId,
    errorMessage: job.errorMessage,
    retryCount: job.retryCount,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}
