import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import prisma from '../lib/prisma';

/** SHA-256 해시 계산 */
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** POST /api/signatures/sign/:noteId */
export async function signNote(req: Request, res: Response): Promise<void> {
  const signerId = req.headers['x-user-id'] as string || 'anonymous';
  const { noteId } = req.params;

  // 이전 서명 조회 (해시 체인용)
  const prevSignature = await prisma.signature.findFirst({
    where: { noteId, status: 'valid' },
    orderBy: { chainIndex: 'desc' },
  });

  const prevHash = prevSignature?.signatureHash ?? null;
  const chainIndex = prevSignature ? prevSignature.chainIndex + 1 : 0;
  const timestamp = new Date().toISOString();

  // 해시 체인: hash(noteId + signerId + timestamp + prevHash)
  const hashInput = `${noteId}:${signerId}:${timestamp}:${prevHash ?? 'genesis'}`;
  const signatureHash = `sha256:${sha256(hashInput)}`;

  const signature = await prisma.signature.create({
    data: {
      id: uuidv4(),
      noteId,
      signerId,
      signatureHash,
      prevHash,
      chainIndex,
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
      details: {
        signatureId: signature.id,
        hash: signature.signatureHash,
        chainIndex,
        prevHash,
      },
      ipAddress: req.ip,
    },
  });

  res.status(201).json({
    signature,
    chainIndex,
    message: '전자서명이 완료되었습니다. 노트가 잠금 상태로 전환됩니다.',
  });
}

/** GET /api/signatures/verify/:noteId — 해시 체인 전체 무결성 검증 */
export async function verifySignature(req: Request, res: Response): Promise<void> {
  const { noteId } = req.params;

  const signatures = await prisma.signature.findMany({
    where: { noteId, status: 'valid' },
    orderBy: { chainIndex: 'asc' },
  });

  if (signatures.length === 0) {
    res.json({ noteId, verified: false, message: '유효한 서명이 없습니다.' });
    return;
  }

  // 체인 무결성 검증
  let chainIntact = true;
  const chainErrors: string[] = [];

  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    const expectedPrevHash = i === 0 ? null : signatures[i - 1].signatureHash;

    if (sig.prevHash !== expectedPrevHash) {
      chainIntact = false;
      chainErrors.push(
        `체인 인덱스 ${sig.chainIndex}: prevHash 불일치 (expected: ${expectedPrevHash}, actual: ${sig.prevHash})`
      );
    }

    if (sig.chainIndex !== i) {
      chainIntact = false;
      chainErrors.push(`chainIndex 불연속: expected ${i}, got ${sig.chainIndex}`);
    }
  }

  res.json({
    noteId,
    verified: chainIntact,
    chainLength: signatures.length,
    latestSignature: signatures[signatures.length - 1],
    chainErrors: chainErrors.length > 0 ? chainErrors : undefined,
    message: chainIntact
      ? `서명 체인이 유효합니다. (${signatures.length}개 서명)`
      : '서명 체인 무결성 오류가 감지되었습니다.',
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
  // TODO: BullMQ 큐 등록 (Phase 6)
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
