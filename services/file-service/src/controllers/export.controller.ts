// services/file-service/src/controllers/export.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ErrorCode, createLogger, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';
import { jobQueue } from '../lib/jobWorker';
import { getPresignedUrlFromBucket, uploadObjectToBucket, EXPORTS_BUCKET, EXPIRY } from '../lib/minio';

const logger = createLogger('file-service');

// ─── POST /api/exports/pdf ───────────────────────────────────────
export async function createPdfExport(request: FastifyRequest, reply: FastifyReply) {
  const { noteId } = request.body as any;
  const requestedBy = request.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const job = await prisma.exportJob.create({
    data: {
      type: 'pdf',
      status: 'PENDING',
      requestedBy,
      orgId: getOrgId(request.headers),
      params: { noteId },
      expiresAt: new Date(Date.now() + EXPIRY.EXPORT_DOWNLOAD * 1000), // 24h
    },
  });
  jobQueue.push(job.id);
  reply.code(202);
  return { ok: true, data: toDto(job) };
}

// ─── POST /api/exports/zip ───────────────────────────────────────
export async function createZipExport(request: FastifyRequest, reply: FastifyReply) {
  const { scope, projectId, noteIds } = request.body as any;
  const requestedBy = request.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const job = await prisma.exportJob.create({
    data: {
      type: 'zip',
      status: 'PENDING',
      requestedBy,
      orgId: getOrgId(request.headers),
      params: { scope, projectId: projectId || null, noteIds: noteIds || null },
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });
  jobQueue.push(job.id);
  reply.code(202);
  return { ok: true, data: toDto(job) };
}

// ─── POST /api/exports ───────────────────────────────────────────
export async function createExport(request: FastifyRequest, reply: FastifyReply) {
  const { type } = request.body as any;
  if (type === 'pdf') {
    return createPdfExport(request, reply);
  }
  if (type === 'zip') {
    return createZipExport(request, reply);
  }
  throw new AppError(400, 'type은 pdf 또는 zip 이어야 합니다.', ErrorCode.EXPORT_INVALID_TYPE);
}

// ─── GET /api/exports ────────────────────────────────────────────
export async function listExports(request: FastifyRequest, reply: FastifyReply) {
  const requestedBy = request.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const { status, page = '1', limit = '20' } = request.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const skip = (pageNum - 1) * limitNum;
  const orgId = getOrgId(request.headers);
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
  return { ok: true, data: jobs.map(toDto), total, page: pageNum };
}

// ─── GET /api/exports/:jobId ─────────────────────────────────────
export async function getExport(request: FastifyRequest, reply: FastifyReply) {
  const requestedBy = request.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const { jobId } = request.params as { jobId: string };
  const job = await prisma.exportJob.findFirst({
    where: { id: jobId, requestedBy, orgId: getOrgId(request.headers) },
  });
  if (!job) { throw new AppError(404, 'Export job을 찾을 수 없습니다.', ErrorCode.EXPORT_NOT_FOUND); }
  return { ok: true, data: toDto(job) };
}

// ─── GET /api/exports/:jobId/download ───────────────────────────
export async function downloadExport(request: FastifyRequest, reply: FastifyReply) {
  const requestedBy = request.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const { jobId } = request.params as { jobId: string };
  const job = await prisma.exportJob.findFirst({
    where: { id: jobId, requestedBy, orgId: getOrgId(request.headers) },
    include: { resultFile: true },
  });
  if (!job) { throw new AppError(404, 'Export job을 찾을 수 없습니다.', ErrorCode.EXPORT_NOT_FOUND); }
  if (job.status !== 'COMPLETED' || !job.resultFile) {
    throw new AppError(409, `Export가 완료되지 않았습니다. 현재 상태: ${job.status}`, ErrorCode.EXPORT_NOT_COMPLETED);
  }
  const url = await getPresignedUrlFromBucket(job.resultFile.bucket, job.resultFile.objectKey, EXPIRY.EXPORT_DOWNLOAD);
  return reply.redirect(url);
}

// ─── DELETE /api/exports/:jobId ──────────────────────────────────
export async function cancelExport(request: FastifyRequest, reply: FastifyReply) {
  const requestedBy = request.headers['x-user-id'] as string;
  if (!requestedBy) {
    throw new AppError(401, '인증이 필요합니다.', ErrorCode.UNAUTHORIZED);
  }
  const { jobId } = request.params as { jobId: string };
  const job = await prisma.exportJob.findFirst({
    where: { id: jobId, requestedBy, orgId: getOrgId(request.headers) },
  });
  if (!job) { throw new AppError(404, 'Export job을 찾을 수 없습니다.', ErrorCode.EXPORT_NOT_FOUND); }
  if (!['PENDING', 'FAILED'].includes(job.status)) {
    throw new AppError(409, `${job.status} 상태의 job은 취소할 수 없습니다.`, ErrorCode.EXPORT_NOT_CANCELLABLE);
  }
  await prisma.exportJob.delete({ where: { id: job.id } });
  return { ok: true, message: 'Export job이 취소되었습니다.' };
}

// ─── POST /api/exports/internal/upload ─────────────────────────────
// 내부 서비스(signature-audit 등)가 생성한 파일을 저장하는 내부 전용 API
export async function internalUploadExport(request: FastifyRequest, reply: FastifyReply) {
  const data = await request.file();
  if (!data) {
    throw new AppError(400, '파일이 필요합니다.', ErrorCode.FILE_NO_FILE);
  }

  const buffer = await data.toBuffer();
  const fields = data.fields;
  const jobId = (fields?.jobId as any)?.value || '';
  const format = (fields?.format as any)?.value || '';
  const source = (fields?.source as any)?.value || 'internal';

  const uploaderId = (request.headers['x-user-id'] as string) || 'system';
  const ext = format === 'zip' ? 'zip' : 'pdf';
  const objectKey = `${format || 'export'}/${jobId || uuidv4()}/export-${new Date().toISOString().slice(0, 10)}.${ext}`;

  await uploadObjectToBucket(EXPORTS_BUCKET, objectKey, buffer, data.mimetype, {
    source,
    jobid: jobId || '',
  });

  const dbFile = await prisma.file.create({
    data: {
      id: uuidv4(),
      bucket: EXPORTS_BUCKET,
      objectKey,
      originalName: data.filename || `export.${ext}`,
      mimeType: data.mimetype,
      sizeBytes: buffer.length,
      uploaderId,
      orgId: (request.headers['x-org-id'] as string) || '',
      refType: 'export',
      refId: jobId || null,
      isDeleted: false,
    },
  });

  const downloadUrl = await getPresignedUrlFromBucket(EXPORTS_BUCKET, objectKey, EXPIRY.EXPORT_DOWNLOAD);

  reply.code(201);
  return {
    ok: true,
    data: {
      fileId: dbFile.id,
      objectKey,
      bucket: EXPORTS_BUCKET,
      downloadUrl,
    },
  };
}

// ─── GET /api/exports/internal/presigned/:fileId ──────────────────
// 내부 서비스용 presigned URL 재발급
export async function internalPresignedUrl(request: FastifyRequest, reply: FastifyReply) {
  const { fileId } = request.params as { fileId: string };
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.isDeleted) {
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }

  const url = await getPresignedUrlFromBucket(file.bucket, file.objectKey, EXPIRY.EXPORT_DOWNLOAD);
  return {
    ok: true,
    data: {
      url,
      expiresAt: new Date(Date.now() + EXPIRY.EXPORT_DOWNLOAD * 1000).toISOString(),
    },
  };
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
