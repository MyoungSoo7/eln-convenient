import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../lib/prisma';
import { createLogger, maskPII } from '@lab/shared';

const logger = createLogger('eln-service');

/**
 * GET /api/notes/internal/all
 *
 * 연구/재인덱싱 전용 — 모든 노트를 PII 마스킹한 상태로 반환.
 * 내부 서비스 전용 (`x-internal-secret` 필수).
 *
 * Query params:
 *   - orgId?: string          — 특정 조직만 필터링
 *   - type?: note|template    — 노트 타입 필터 (기본: note)
 *   - status?: string         — 상태 필터
 *   - since?: ISO8601         — 특정 시각 이후 업데이트된 것만
 *   - limit?: number          — 페이지 크기 (기본 500, 최대 2000)
 *   - cursor?: string         — 다음 페이지용 updatedAt 커서
 *   - mask?: boolean          — PII 마스킹 여부 (기본 true, false 시 감사로그 남김)
 *   - format?: sft            — "sft"면 fine-tuning용 (instruction/input/output) 포맷
 */
export async function getAllNotesInternal(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const q = request.query as Record<string, string | undefined>;

  const orgId = q.orgId;
  const type = (q.type as 'note' | 'template') || 'note';
  const status = q.status;
  const since = q.since ? new Date(q.since) : undefined;
  const limit = Math.min(parseInt(q.limit || '500', 10), 2000);
  const cursor = q.cursor ? new Date(q.cursor) : undefined;
  const mask = q.mask !== 'false'; // 기본 true
  const format = q.format;

  const where: Record<string, unknown> = {
    deletedAt: null,
    type,
    ...(orgId && { orgId }),
    ...(status && { status }),
    ...(since && { updatedAt: { gte: since } }),
    ...(cursor && { updatedAt: { lt: cursor } }),
  };

  const notes = await prisma.note.findMany({
    where,
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      sections: true,
      status: true,
      authorId: true,
      orgId: true,
      teamId: true,
      templateId: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  if (!mask) {
    logger.warn(
      { count: notes.length, caller: request.headers['x-user-id'] ?? 'internal' },
      '[internal/all] PII 마스킹 해제 접근 — 감사 대상'
    );
  }

  const processed = mask ? notes.map((n) => maskPII(n)) : notes;

  // SFT 포맷 변환
  if (format === 'sft') {
    const sftRecords = processed
      .filter((n) => n.content && n.content.length > 50)
      .map((n) => ({
        instruction: `다음 주제에 대한 실험 노트를 작성해주세요: ${n.title}`,
        input: (n.tags ?? []).join(', '),
        output: n.content,
        metadata: {
          noteId: n.id,
          status: n.status,
          orgId: n.orgId,
          createdAt: n.createdAt,
        },
      }));
    reply.send({
      ok: true,
      data: sftRecords,
      count: sftRecords.length,
      nextCursor: notes.length === limit ? notes[notes.length - 1].updatedAt : null,
    });
    return;
  }

  reply.send({
    ok: true,
    data: processed,
    count: processed.length,
    nextCursor: notes.length === limit ? notes[notes.length - 1].updatedAt : null,
  });
}

/**
 * GET /api/notes/internal/count
 * 빠른 건수 조회 (재인덱싱 계획 수립용)
 */
export async function getNotesCountInternal(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const q = request.query as Record<string, string | undefined>;
  const type = (q.type as 'note' | 'template') || 'note';
  const orgId = q.orgId;

  const count = await prisma.note.count({
    where: { deletedAt: null, type, ...(orgId && { orgId }) },
  });

  reply.send({ ok: true, data: { count, type, orgId: orgId ?? 'all' } });
}
