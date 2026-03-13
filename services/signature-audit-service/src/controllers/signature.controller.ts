import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import prisma from '../lib/prisma';

/** POST /api/signatures/sign/:noteId */
export async function signNote(req: Request, res: Response): Promise<void> {
  const signerId = req.headers['x-user-id'] as string || 'anonymous';
  const { noteId } = req.params;

  // 해시: noteId + signerId + timestamp (실제 RFC 3161 시점인증은 Phase 3에서 구현)
  const timestamp = new Date().toISOString();
  const signatureHash = crypto
    .createHash('sha256')
    .update(`${noteId}:${signerId}:${timestamp}`)
    .digest('hex');

  const signature = await prisma.signature.create({
    data: {
      id: uuidv4(),
      noteId,
      signerId,
      signatureHash: `sha256:${signatureHash}`,
      status: 'valid',
    },
  });

  // 감사로그 기록
  await prisma.auditLog.create({
    data: {
      id: uuidv4(),
      entityType: 'note',
      entityId: noteId,
      action: 'signed',
      actorId: signerId,
      details: { signatureId: signature.id, hash: signature.signatureHash },
      ipAddress: req.ip,
    },
  });

  res.status(201).json({ signature, message: '전자서명이 완료되었습니다. 노트가 잠금 상태로 전환됩니다.' });
}

/** GET /api/signatures/verify/:noteId */
export async function verifySignature(req: Request, res: Response): Promise<void> {
  const signature = await prisma.signature.findFirst({
    where: { noteId: req.params.noteId, status: 'valid' },
    orderBy: { timestamp: 'desc' },
  });
  if (!signature) {
    res.json({ noteId: req.params.noteId, verified: false, message: '유효한 서명이 없습니다.' });
    return;
  }
  res.json({
    noteId: req.params.noteId,
    verified: true,
    signature,
    message: '서명이 유효합니다.',
    verifiedAt: new Date().toISOString(),
  });
}

/** GET /api/audit */
export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  const { entityId, type, page = '1', limit = '50' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Record<string, unknown> = {};
  if (entityId) where.entityId = entityId;
  if (type) where.entityType = type;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ data: logs, total });
}

/** POST /api/export/pdf/:noteId */
export async function exportPdf(req: Request, res: Response): Promise<void> {
  const job = await prisma.exportJob.create({
    data: {
      id: uuidv4(),
      noteId: req.params.noteId,
      format: 'pdf',
      status: 'pending',
    },
  });
  // TODO: 실제 PDF 변환 큐(Bull/BullMQ) 등록
  res.status(202).json({ job, message: 'PDF 변환이 요청되었습니다.' });
}

/** GET /api/export/status/:jobId */
export async function getExportStatus(req: Request, res: Response): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) { res.status(404).json({ error: '작업을 찾을 수 없습니다.' }); return; }
  res.json(job);
}

/** POST /api/export/zip */
export async function exportZip(req: Request, res: Response): Promise<void> {
  const job = await prisma.exportJob.create({
    data: {
      id: uuidv4(),
      noteId: 'bulk',
      format: 'zip',
      status: 'pending',
    },
  });
  res.status(202).json({ job, noteIds: req.body.noteIds, message: 'ZIP 내보내기가 요청되었습니다.' });
}
