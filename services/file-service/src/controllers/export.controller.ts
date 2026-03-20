// services/file-service/src/controllers/export.controller.ts
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler, ErrorCode, createLogger, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';
import { jobQueue } from '../lib/jobWorker';
import { getPresignedUrlFromBucket, uploadObjectToBucket, EXPORTS_BUCKET, EXPIRY } from '../lib/minio';

const logger = createLogger('file-service');

// ─── POST /api/exports/pdf ───────────────────────────────────────
export const createPdfExport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { noteId } = req.body;
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const job = await prisma.exportJob.create({
    data: {
      type: 'pdf',
      status: 'PENDING',
      requestedBy,
      orgId: getOrgId(req),
      params: { noteId },
      expiresAt: new Date(Date.now() + EXPIRY.EXPORT_DOWNLOAD * 1000), // 24h
    },
  });
  jobQueue.push(job.id);
  res.status(202).json({ ok: true, data: toDto(job) });
});

// ─── POST /api/exports/zip ───────────────────────────────────────
export const createZipExport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { scope, projectId, noteIds } = req.body;
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const job = await prisma.exportJob.create({
    data: {
      type: 'zip',
      status: 'PENDING',
      requestedBy,
      orgId: getOrgId(req),
      params: { scope, projectId: projectId || null, noteIds: noteIds || null },
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });
  jobQueue.push(job.id);
  res.status(202).json({ ok: true, data: toDto(job) });
});

// ─── POST /api/exports ───────────────────────────────────────────
export const createExport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { type } = req.body;
  if (type === 'pdf') {
    return createPdfExport(req, res, () => {});
  }
  if (type === 'zip') {
    return createZipExport(req, res, () => {});
  }
  throw new AppError(400, 'type은 pdf 또는 zip 이어야 합니다.', ErrorCode.EXPORT_INVALID_TYPE);
});

// ─── GET /api/exports ────────────────────────────────────────────
export const listExports = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const { status, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const skip = (pageNum - 1) * limitNum;
  const orgId = getOrgId(req);
  const where = {
    requestedBy,
    orgId,
    ...(status ? { status: status as string } : {}),
  };
  const [jobs, total] = await Promise.all([
    prisma.exportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.exportJob.count({ where }),
  ]);
  res.json({ ok: true, data: jobs.map(toDto), total, page: pageNum });
});

// ─── GET /api/exports/:jobId ─────────────────────────────────────
export const getExport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const job = await prisma.exportJob.findFirst({
    where: { id: req.params.jobId, requestedBy, orgId: getOrgId(req) },
  });
  if (!job) { throw new AppError(404, 'Export job을 찾을 수 없습니다.', ErrorCode.EXPORT_NOT_FOUND); }
  res.json({ ok: true, data: toDto(job) });
});

// ─── GET /api/exports/:jobId/download ───────────────────────────
export const downloadExport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const job = await prisma.exportJob.findFirst({
    where: { id: req.params.jobId, requestedBy, orgId: getOrgId(req) },
    include: { resultFile: true },
  });
  if (!job) { throw new AppError(404, 'Export job을 찾을 수 없습니다.', ErrorCode.EXPORT_NOT_FOUND); }
  if (job.status !== 'COMPLETED' || !job.resultFile) {
    throw new AppError(409, `Export가 완료되지 않았습니다. 현재 상태: ${job.status}`, ErrorCode.EXPORT_NOT_COMPLETED);
  }
  const url = await getPresignedUrlFromBucket(job.resultFile.bucket, job.resultFile.objectKey, EXPIRY.EXPORT_DOWNLOAD);
  res.redirect(url);
});

// ─── DELETE /api/exports/:jobId ──────────────────────────────────
export const cancelExport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const job = await prisma.exportJob.findFirst({
    where: { id: req.params.jobId, requestedBy, orgId: getOrgId(req) },
  });
  if (!job) { throw new AppError(404, 'Export job을 찾을 수 없습니다.', ErrorCode.EXPORT_NOT_FOUND); }
  if (!['PENDING', 'FAILED'].includes(job.status)) {
    throw new AppError(409, `${job.status} 상태의 job은 취소할 수 없습니다.`, ErrorCode.EXPORT_NOT_CANCELLABLE);
  }
  await prisma.exportJob.delete({ where: { id: job.id } });
  res.json({ ok: true, message: 'Export job이 취소되었습니다.' });
});

// ─── POST /api/exports/internal/upload ─────────────────────────────
// 내부 서비스(signature-audit 등)가 생성한 파일을 저장하는 내부 전용 API
export const internalUploadExport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    throw new AppError(400, '파일이 필요합니다.', ErrorCode.FILE_NO_FILE);
  }

  const { jobId, format, source } = req.body;
  const uploaderId = (req.headers['x-user-id'] as string) || 'system';
  const ext = format === 'zip' ? 'zip' : 'pdf';
  const objectKey = `${format || 'export'}/${jobId || uuidv4()}/export-${new Date().toISOString().slice(0, 10)}.${ext}`;

  await uploadObjectToBucket(EXPORTS_BUCKET, objectKey, file.buffer, file.mimetype, {
    source: source || 'internal',
    jobid: jobId || '',
  });

  const dbFile = await prisma.file.create({
    data: {
      id: uuidv4(),
      bucket: EXPORTS_BUCKET,
      objectKey,
      originalName: file.originalname || `export.${ext}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploaderId,
      orgId: (req.headers['x-org-id'] as string) || '',
      refType: 'export',
      refId: jobId || null,
      isDeleted: false,
    },
  });

  const downloadUrl = await getPresignedUrlFromBucket(EXPORTS_BUCKET, objectKey, EXPIRY.EXPORT_DOWNLOAD);

  res.status(201).json({
    ok: true,
    data: {
      fileId: dbFile.id,
      objectKey,
      bucket: EXPORTS_BUCKET,
      downloadUrl,
    },
  });
});

// ─── GET /api/exports/internal/presigned/:fileId ──────────────────
// 내부 서비스용 presigned URL 재발급
export const internalPresignedUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const file = await prisma.file.findUnique({ where: { id: req.params.fileId } });
  if (!file || file.isDeleted) {
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }

  const url = await getPresignedUrlFromBucket(file.bucket, file.objectKey, EXPIRY.EXPORT_DOWNLOAD);
  res.json({
    ok: true,
    data: {
      url,
      expiresAt: new Date(Date.now() + EXPIRY.EXPORT_DOWNLOAD * 1000).toISOString(),
    },
  });
});

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
    updatedAt: job.updatedAt.toISOString(),
  };
}
