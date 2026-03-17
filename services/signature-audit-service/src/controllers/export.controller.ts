import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { exportQueue } from '../lib/queue';

async function recordAuditLog(
  action: string,
  actorId: string,
  entityId: string,
  details: object,
  ipAddress?: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: uuidv4(),
      entityType: 'export',
      entityId,
      action,
      actorId,
      details,
      ipAddress: ipAddress ?? null,
    },
  });
}

/** POST /api/export/pdf/:noteId */
export async function exportPdf(req: Request, res: Response): Promise<void> {
  const requestedBy = (req.headers['x-user-id'] as string) || 'anonymous';
  const { noteId } = req.params;

  try {
    const job = await prisma.exportJob.create({
      data: {
        id: uuidv4(),
        noteId,
        format: 'pdf',
        status: 'pending',
        requestedBy,
      },
    });

    await exportQueue.add('pdf', {
      jobId: job.id,
      noteId,
      format: 'pdf',
      requestedBy,
    });

    await recordAuditLog('export_requested', requestedBy, job.id, { noteId, format: 'pdf', jobId: job.id }, req.ip);

    res.status(202).json({
      ok: true,
      data: {
        jobId: job.id,
        noteId: job.noteId,
        status: job.status,
        message: 'PDF 내보내기 작업이 대기열에 추가되었습니다.',
      },
    });
  } catch (err) {
    console.error('[exportPdf]', err);
    res.status(500).json({ ok: false, error: 'PDF 내보내기 요청 중 오류가 발생했습니다.' });
  }
}

/** GET /api/export/status/:jobId */
export async function getExportStatus(req: Request, res: Response): Promise<void> {
  try {
    const job = await prisma.exportJob.findUnique({ where: { id: req.params.jobId } });
    if (!job) { res.status(404).json({ ok: false, error: '작업을 찾을 수 없습니다.' }); return; }
    res.json({
      ok: true,
      data: {
        jobId: job.id,
        noteId: job.noteId,
        format: job.format,
        status: job.status,
        downloadUrl: job.fileUrl ?? null,
        errorMsg: job.errorMsg ?? null,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error('[getExportStatus]', err);
    res.status(500).json({ ok: false, error: '작업 상태 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/export/zip */
export async function exportZip(req: Request, res: Response): Promise<void> {
  const requestedBy = (req.headers['x-user-id'] as string) || 'anonymous';
  const noteIds: string[] = req.body.noteIds ?? [];

  if (noteIds.length === 0) {
    res.status(400).json({ ok: false, error: 'noteIds 배열이 필요합니다.' });
    return;
  }

  try {
    const job = await prisma.exportJob.create({
      data: {
        id: uuidv4(),
        noteId: 'bulk',
        noteIds,
        format: 'zip',
        status: 'pending',
        requestedBy,
      },
    });

    await exportQueue.add('zip', {
      jobId: job.id,
      noteId: 'bulk',
      noteIds,
      format: 'zip',
      requestedBy,
    });

    await recordAuditLog('export_requested', requestedBy, job.id, { noteIds, format: 'zip', jobId: job.id }, req.ip);

    res.status(202).json({
      ok: true,
      data: {
        jobId: job.id,
        noteIds,
        status: job.status,
        message: 'ZIP 내보내기 작업이 대기열에 추가되었습니다.',
      },
    });
  } catch (err) {
    console.error('[exportZip]', err);
    res.status(500).json({ ok: false, error: 'ZIP 내보내기 요청 중 오류가 발생했습니다.' });
  }
}

/** GET /api/export/list — 내 내보내기 작업 목록 */
export async function listExportJobs(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  // admin은 전체 조회, 일반 사용자는 본인 것만
  const where = userRole === 'admin' ? {} : { requestedBy };

  try {
    const jobs = await prisma.exportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({
      ok: true,
      data: jobs.map((j) => ({
        jobId: j.id,
        noteId: j.noteId,
        format: j.format,
        status: j.status,
        downloadUrl: j.fileUrl ?? null,
        createdAt: j.createdAt.toISOString(),
        completedAt: j.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    console.error('[listExportJobs]', err);
    res.status(500).json({ ok: false, error: '작업 목록 조회 중 오류가 발생했습니다.' });
  }
}
