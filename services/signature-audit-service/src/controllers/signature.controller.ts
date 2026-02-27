import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ISignature, IAuditLog, IExportJob } from '../interfaces/signature.interface';

// ─── 더미 데이터 ───
const DUMMY_AUDIT_LOGS: IAuditLog[] = [
  { id: 'audit-001', entityType: 'note', entityId: 'note-001', action: 'created', actorId: 'dev-user-001', details: { title: 'PCR 최적화 실험' }, createdAt: '2024-01-15T09:00:00Z' },
  { id: 'audit-002', entityType: 'note', entityId: 'note-001', action: 'updated', actorId: 'dev-user-001', details: { section: '결과' }, createdAt: '2024-01-15T14:30:00Z' },
  { id: 'audit-003', entityType: 'note', entityId: 'note-002', action: 'signed', actorId: 'dev-user-001', details: { signatureId: 'sig-001' }, createdAt: '2024-01-10T16:00:00Z' },
];

/** POST /api/signatures/sign/:noteId */
export function signNote(req: Request, res: Response): void {
  // TODO: 실제 해시 체인 서명 + 시점인증
  const signature: ISignature = {
    id: uuidv4(), noteId: req.params.noteId, signerId: req.headers['x-user-id'] as string || 'dev-user-001',
    signatureHash: `sha256:dummy-${Date.now()}`, timestamp: new Date().toISOString(), status: 'valid',
  };
  console.log(`[signature] 노트 서명 완료: ${req.params.noteId}`);
  res.status(201).json({ signature, message: '전자서명이 완료되었습니다. 노트가 잠금 상태로 전환됩니다.' });
}

/** GET /api/signatures/verify/:noteId */
export function verifySignature(req: Request, res: Response): void {
  // TODO: 해시 체인 검증
  res.json({ noteId: req.params.noteId, verified: true, message: '서명이 유효합니다.', verifiedAt: new Date().toISOString() });
}

/** GET /api/audit */
export function getAuditLogs(req: Request, res: Response): void {
  let logs = DUMMY_AUDIT_LOGS;
  if (req.query.entityId) logs = logs.filter((l) => l.entityId === req.query.entityId);
  if (req.query.type) logs = logs.filter((l) => l.entityType === req.query.type);
  res.json({ data: logs, total: logs.length });
}

/** POST /api/export/pdf/:noteId */
export function exportPdf(req: Request, res: Response): void {
  // TODO: 실제 PDF 변환 (Puppeteer 등)
  const job: IExportJob = {
    id: uuidv4(), noteId: req.params.noteId, format: 'pdf', status: 'pending',
    requestedBy: req.headers['x-user-id'] as string || 'dev-user-001', createdAt: new Date().toISOString(),
  };
  res.status(202).json({ job, message: 'PDF 변환이 요청되었습니다.' });
}

/** GET /api/export/status/:jobId */
export function getExportStatus(req: Request, res: Response): void {
  res.json({ id: req.params.jobId, status: 'completed', fileUrl: `/api/files/dummy-pdf-${req.params.jobId}`, completedAt: new Date().toISOString() });
}

/** POST /api/export/zip */
export function exportZip(req: Request, res: Response): void {
  const job: IExportJob = {
    id: uuidv4(), noteId: 'bulk', format: 'zip', status: 'pending',
    requestedBy: req.headers['x-user-id'] as string || 'dev-user-001', createdAt: new Date().toISOString(),
  };
  res.status(202).json({ job, noteIds: req.body.noteIds, message: 'ZIP 내보내기가 요청되었습니다.' });
}
