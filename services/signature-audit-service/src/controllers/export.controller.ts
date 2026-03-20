import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler, ErrorCode, createLogger } from '@lab/shared';
import prisma from '../lib/prisma';
import { exportQueue } from '../lib/queue';
import { getExportPresignedUrl } from '../lib/fileServiceClient';

const logger = createLogger('signature-audit-service');

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
export const exportPdf = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestedBy = (req.headers['x-user-id'] as string) || 'anonymous';
  const { noteId } = req.params;

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
      job: {
        id: job.id,
        jobId: job.id,
        noteId: job.noteId,
        format: job.format,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
      },
      jobId: job.id,
      noteId: job.noteId,
      status: job.status,
      message: 'PDF 내보내기 작업이 대기열에 추가되었습니다.',
    },
  });
});

/** GET /api/export/status/:jobId */
export const getExportStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const job = await prisma.exportJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) {
    throw new AppError(404, '작업을 찾을 수 없습니다.', ErrorCode.EXPORT_NOT_FOUND);
  }

  // 완료된 작업이고 fileId가 있으면 presigned URL 재발급 (만료 방지)
  let downloadUrl = job.fileUrl ?? null;
  if (job.status === 'completed' && job.fileId) {
    try {
      downloadUrl = await getExportPresignedUrl(job.fileId);
    } catch {
      // file-service 호출 실패 시 기존 URL 유지
    }
  }

  res.json({
    ok: true,
    data: {
      id: job.id,
      jobId: job.id,
      noteId: job.noteId,
      format: job.format,
      status: job.status,
      fileUrl: downloadUrl,
      downloadUrl,
      errorMsg: job.errorMsg ?? null,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    },
  });
});

/** POST /api/export/zip */
export const exportZip = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestedBy = (req.headers['x-user-id'] as string) || 'anonymous';
  const noteIds: string[] = req.body.noteIds;

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
      job: {
        id: job.id,
        jobId: job.id,
        noteId: job.noteId,
        noteIds,
        format: job.format,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
      },
      jobId: job.id,
      noteIds,
      status: job.status,
      message: 'ZIP 내보내기 작업이 대기열에 추가되었습니다.',
    },
  });
});

/** POST /api/export/report — 프로젝트 보고서 종합 PDF (복수 노트 → 1개 PDF) */
export const exportReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestedBy = (req.headers['x-user-id'] as string) || 'anonymous';
  const noteIds: string[] = req.body.noteIds;

  const job = await prisma.exportJob.create({
    data: {
      id: uuidv4(),
      noteId: 'report',
      noteIds,
      format: 'report',
      status: 'pending',
      requestedBy,
    },
  });

  await exportQueue.add('report', {
    jobId: job.id,
    noteId: 'report',
    noteIds,
    format: 'report',
    requestedBy,
  });

  await recordAuditLog('export_requested', requestedBy, job.id, { noteIds, format: 'report', jobId: job.id }, req.ip);

  res.status(202).json({
    ok: true,
    data: {
      job: {
        id: job.id,
        jobId: job.id,
        noteId: job.noteId,
        noteIds,
        format: job.format,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
      },
      jobId: job.id,
      noteIds,
      status: job.status,
      message: '프로젝트 보고서 PDF 작업이 대기열에 추가되었습니다.',
    },
  });
});

/** GET /api/export/list — 내 내보내기 작업 목록 */
export const listExportJobs = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestedBy = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  // admin은 전체 조회, 일반 사용자는 본인 것만
  const where = userRole === 'admin' ? {} : { requestedBy };

  const jobs = await prisma.exportJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // 완료된 작업의 presigned URL 재발급 (병렬)
  const jobDtos = await Promise.all(jobs.map(async (j) => {
    let downloadUrl = j.fileUrl ?? null;
    if (j.status === 'completed' && j.fileId) {
      try { downloadUrl = await getExportPresignedUrl(j.fileId); } catch { /* 기존 URL 유지 */ }
    }
    return {
      jobId: j.id,
      noteId: j.noteId,
      format: j.format,
      status: j.status,
      downloadUrl,
      createdAt: j.createdAt.toISOString(),
      completedAt: j.completedAt?.toISOString() ?? null,
    };
  }));

  res.json({ ok: true, data: jobDtos });
});
