import { FastifyRequest, FastifyReply } from 'fastify';

const DUMMY_LOGS = [
  { id: 'audit-001', entityId: 'note-001', entityType: 'note', action: 'created', userId: 'user-001', timestamp: '2024-03-15T09:00:00Z', details: '노트 생성' },
  { id: 'audit-002', entityId: 'note-001', entityType: 'note', action: 'updated', userId: 'user-001', timestamp: '2024-03-15T10:00:00Z', details: '결과 섹션 수정' },
  { id: 'audit-003', entityId: 'note-001', entityType: 'note', action: 'signed', userId: 'user-001', timestamp: '2024-03-15T10:30:00Z', details: '전자서명 완료' },
];

export async function listAuditLogs(req: FastifyRequest<{ Querystring: { entityId?: string; type?: string } }>, reply: FastifyReply) {
  const { entityId, type } = req.query as any;
  let logs = DUMMY_LOGS;
  if (entityId) logs = logs.filter((l) => l.entityId === entityId);
  if (type) logs = logs.filter((l) => l.entityType === type);
  return { ok: true, data: logs };
}

export async function getAuditLog(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const log = DUMMY_LOGS.find((l) => l.id === req.params.id) || DUMMY_LOGS[0];
  return { ok: true, data: log };
}
