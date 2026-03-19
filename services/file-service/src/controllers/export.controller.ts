// services/file-service/src/controllers/export.controller.ts
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { jobQueue } from '../lib/jobWorker';
import { getPresignedUrlFromBucket, uploadObjectToBucket, EXPORTS_BUCKET, EXPIRY } from '../lib/minio';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

// ─── POST /api/exports/pdf ───────────────────────────────────────
export async function createPdfExport(req: Request, res: Response): Promise<void> {
  const { noteId } = req.body;
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
    return;
  }
  try {
    const job = await prisma.exportJob.create({
      data: {
        type: 'pdf',
        status: 'PENDING',
        requestedBy,
        params: { noteId },
        expiresAt: new Date(Date.now() + EXPIRY.EXPORT_DOWNLOAD * 1000), // 24h
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
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
    return;
  }
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

// ─── POST /api/exports ───────────────────────────────────────────
export async function createExport(req: Request, res: Response): Promise<void> {
  const { type } = req.body;
  if (type === 'pdf') {
    return createPdfExport(req, res);
  }
  if (type === 'zip') {
    return createZipExport(req, res);
  }
  res.status(400).json({ ok: false, error: 'type은 pdf 또는 zip 이어야 합니다.' });
}

// ─── GET /api/exports ────────────────────────────────────────────
export async function listExports(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
    return;
  }
  const { status, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const skip = (pageNum - 1) * limitNum;
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
        take: limitNum,
      }),
      prisma.exportJob.count({ where }),
    ]);
    res.json({ ok: true, data: jobs.map(toDto), total, page: pageNum });
  } catch (err) {
    console.error('[export] 목록 조회 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 목록 조회에 실패했습니다.' });
  }
}

// ─── GET /api/exports/:jobId ─────────────────────────────────────
export async function getExport(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
    return;
  }
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
  if (!requestedBy) {
    res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
    return;
  }
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
    const url = await getPresignedUrlFromBucket(job.resultFile.bucket, job.resultFile.objectKey, EXPIRY.EXPORT_DOWNLOAD);
    res.redirect(url);
  } catch (err) {
    console.error('[export] download 실패:', err);
    res.status(502).json({ ok: false, error: '다운로드 URL 생성에 실패했습니다.' });
  }
}

// ─── DELETE /api/exports/:jobId ──────────────────────────────────
export async function cancelExport(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  if (!requestedBy) {
    res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
    return;
  }
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

// ─── POST /api/exports/internal/upload ─────────────────────────────
// 내부 서비스(signature-audit 등)가 생성한 파일을 저장하는 내부 전용 API
export async function internalUploadExport(req: Request, res: Response): Promise<void> {
  const secret = req.headers['x-internal-secret'] as string;
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    res.status(403).json({ ok: false, error: '내부 서비스 인증 실패' });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ ok: false, error: '파일이 필요합니다.' });
    return;
  }

  const { jobId, format, source } = req.body;
  const uploaderId = (req.headers['x-user-id'] as string) || 'system';
  const ext = format === 'zip' ? 'zip' : 'pdf';
  const objectKey = `${format || 'export'}/${jobId || uuidv4()}/export-${new Date().toISOString().slice(0, 10)}.${ext}`;

  try {
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
  } catch (err) {
    console.error('[export] internal upload 실패:', err);
    res.status(500).json({ ok: false, error: '파일 저장에 실패했습니다.' });
  }
}

// ─── GET /api/exports/internal/presigned/:fileId ──────────────────
// 내부 서비스용 presigned URL 재발급
export async function internalPresignedUrl(req: Request, res: Response): Promise<void> {
  const secret = req.headers['x-internal-secret'] as string;
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    res.status(403).json({ ok: false, error: '내부 서비스 인증 실패' });
    return;
  }

  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.isDeleted) {
      res.status(404).json({ ok: false, error: '파일을 찾을 수 없습니다.' });
      return;
    }

    const url = await getPresignedUrlFromBucket(file.bucket, file.objectKey, EXPIRY.EXPORT_DOWNLOAD);
    res.json({
      ok: true,
      data: {
        url,
        expiresAt: new Date(Date.now() + EXPIRY.EXPORT_DOWNLOAD * 1000).toISOString(),
      },
    });
  } catch (err) {
    console.error('[export] internal presigned 실패:', err);
    res.status(500).json({ ok: false, error: 'URL 생성에 실패했습니다.' });
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
    updatedAt: job.updatedAt.toISOString(),
  };
}
