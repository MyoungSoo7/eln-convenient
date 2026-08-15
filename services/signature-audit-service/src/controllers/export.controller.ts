import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ErrorCode, createLogger, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';
import { exportQueue } from '../lib/queue';
import { getExportPresignedUrl } from '../lib/fileServiceClient';

const logger = createLogger('signature-audit-service');

const ELN_SERVICE_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

async function validateNoteExportable(noteId: string, orgId: string): Promise<void> {
  if (noteId === 'bulk' || noteId === 'report') return;
  try {
    const res = await fetch(`${ELN_SERVICE_URL}/api/notes/${noteId}`, {
      headers: { 'x-internal-secret': INTERNAL_SECRET, 'x-user-org-id': orgId },
    });
    if (!res.ok) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.EXPORT_NOT_FOUND);
    const data = await res.json();
    const status = data?.data?.status;
    if (status !== 'signed' && status !== 'locked') {
      throw new AppError(400, '서명 완료 또는 잠금 상태의 노트만 내보내기할 수 있습니다.', ErrorCode.EXPORT_NOT_ALLOWED);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, noteId }, '노트 상태 확인 실패');
    throw new AppError(502, '노트 상태 확인에 실패했습니다.', ErrorCode.EXPORT_NOT_FOUND);
  }
}

async function validateNotesExportable(noteIds: string[], orgId: string): Promise<void> {
  for (const noteId of noteIds) {
    await validateNoteExportable(noteId, orgId);
  }
}

async function recordAuditLog(
  action: string,
  actorId: string,
  entityId: string,
  details: object,
  orgId: string,
  ipAddress?: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: uuidv4(),
      entityType: 'export',
      entityId,
      action,
      actorId,
      orgId,
      details,
      ipAddress: ipAddress ?? null,
    },
  });
}

/** POST /api/export/pdf/:noteId */
export async function exportPdf(request: FastifyRequest, reply: FastifyReply) {
  const requestedBy = (request.headers['x-user-id'] as string) || 'anonymous';
  const { noteId } = request.params as { noteId: string };

  const orgId = getOrgId(request.headers);

  await validateNoteExportable(noteId, orgId);

  const job = await prisma.exportJob.create({
    data: {
      id: uuidv4(),
      noteId,
      format: 'pdf',
      status: 'pending',
      requestedBy,
      orgId,
    },
  });

  await exportQueue.add('pdf', {
    jobId: job.id,
    noteId,
    format: 'pdf',
    requestedBy,
    orgId,
  });

  await recordAuditLog('export_requested', requestedBy, job.id, { noteId, format: 'pdf', jobId: job.id }, orgId, request.ip);

  reply.code(202);
  return {
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
  };
}

/** GET /api/export/status/:jobId */
export async function getExportStatus(request: FastifyRequest, reply: FastifyReply) {
  const { jobId } = request.params as { jobId: string };
  const job = await prisma.exportJob.findFirst({ where: { id: jobId, orgId: getOrgId(request.headers) } });
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

  return {
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
  };
}

/** POST /api/export/zip */
export async function exportZip(request: FastifyRequest, reply: FastifyReply) {
  const requestedBy = (request.headers['x-user-id'] as string) || 'anonymous';
  const noteIds: string[] = (request.body as any).noteIds;
  const orgId = getOrgId(request.headers);

  await validateNotesExportable(noteIds, orgId);

  const job = await prisma.exportJob.create({
    data: {
      id: uuidv4(),
      noteId: 'bulk',
      noteIds,
      format: 'zip',
      status: 'pending',
      requestedBy,
      orgId,
    },
  });

  await exportQueue.add('zip', {
    jobId: job.id,
    noteId: 'bulk',
    noteIds,
    format: 'zip',
    requestedBy,
    orgId,
  });

  await recordAuditLog('export_requested', requestedBy, job.id, { noteIds, format: 'zip', jobId: job.id }, orgId, request.ip);

  reply.code(202);
  return {
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
  };
}

/** POST /api/export/report — 프로젝트 보고서 종합 PDF (복수 노트 → 1개 PDF) */
export async function exportReport(request: FastifyRequest, reply: FastifyReply) {
  const requestedBy = (request.headers['x-user-id'] as string) || 'anonymous';
  const noteIds: string[] = (request.body as any).noteIds;
  const orgId = getOrgId(request.headers);

  const job = await prisma.exportJob.create({
    data: {
      id: uuidv4(),
      noteId: 'report',
      noteIds,
      format: 'report',
      status: 'pending',
      requestedBy,
      orgId,
    },
  });

  await exportQueue.add('report', {
    jobId: job.id,
    noteId: 'report',
    noteIds,
    format: 'report',
    requestedBy,
    orgId,
  });

  await recordAuditLog('export_requested', requestedBy, job.id, { noteIds, format: 'report', jobId: job.id }, orgId, request.ip);

  reply.code(202);
  return {
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
  };
}

/** GET /api/export/list — 내 내보내기 작업 목록 */
export async function listExportJobs(request: FastifyRequest, reply: FastifyReply) {
  const requestedBy = request.headers['x-user-id'] as string;
  const userRole = request.headers['x-user-role'] as string;
  const orgId = getOrgId(request.headers);

  // admin은 org 전체 조회, 일반 사용자는 본인 것만
  const where = userRole === 'admin' ? { orgId } : { requestedBy, orgId };

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

  return { ok: true, data: jobDtos };
}
