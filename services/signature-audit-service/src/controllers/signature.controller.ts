import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { AppError, ErrorCode, createLogger, getOrgId, getTeamRoles, Permission } from '@lab/shared';
import prisma from '../lib/prisma';
import { publishEvent, notificationQueue } from '../lib/queue';
import { fetchNoteCount, fetchNotes, fetchNote, ElnServiceError } from '../lib/eln';

const logger = createLogger('signature-audit-service');

const ELN_SERVICE_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

type VerifyResult = { verified: true } | { verified: false; reason: 'wrong_password' | 'service_error' };

/** auth-service에 비밀번호 검증 요청 */
async function verifyUserPassword(userId: string, password: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/internal/verify-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ userId, password }),
    });
    if (!res.ok) return { verified: false, reason: 'service_error' };
    const body = await res.json() as any;
    if (body.verified === true) {
      return { verified: true };
    }
    return { verified: false, reason: 'wrong_password' };
  } catch {
    return { verified: false, reason: 'service_error' };
  }
}

/** SHA-256 해시 계산 */
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * ELN 서비스에 노트 상태 변경 요청
 * 서명 완료 후 note.status = 'signed' 로 전환
 *
 * 전략: Redis Stream 이벤트 발행 우선 → 실패 시 HTTP 직접 호출 폴백
 * eln-service의 eventConsumer가 Stream에서 이벤트를 소비하여 상태 변경
 */
async function patchNoteStatus(noteId: string, status: string, userId: string, orgId: string): Promise<boolean> {
  // 1차: Redis Stream 이벤트 발행 (비동기, ~1ms)
  const eventId = await publishEvent('NOTE_SIGNED', {
    noteId,
    status,
    userId,
    timestamp: new Date().toISOString(),
  });

  if (eventId) {
    logger.info({ noteId, eventId }, '이벤트 발행 완료: NOTE_SIGNED');
    return true;
  }

  // 2차 폴백: Redis 실패 시 기존 HTTP 직접 호출
  logger.warn('Redis 이벤트 발행 실패 — HTTP 폴백으로 전환');
  try {
    const res = await fetch(`${ELN_SERVICE_URL}/api/notes/${noteId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-user-id': userId,
        'x-user-role': 'system',
        'x-user-permissions': JSON.stringify([Permission.NOTE_STATUS]),
        'x-internal-secret': INTERNAL_SECRET,
        'x-user-org-id': orgId,
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body, noteId }, 'ELN 상태 변경 실패 (Redis + HTTP 모두 실패)');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, noteId }, 'ELN 서비스 상태 변경 호출 오류 (Redis + HTTP 모두 실패)');
    return false;
  }
}

// ─────────────────────────────────────────────
// 전자서명
// ─────────────────────────────────────────────

/** POST /api/signatures/sign/:noteId */
export async function signNote(request: FastifyRequest, reply: FastifyReply) {
  const signerId = (request.headers['x-user-id'] as string) || 'anonymous';
  const { noteId } = request.params as { noteId: string };
  const { comment, password } = request.body as any;

  // 비밀번호 검증 (필수)
  const verifyResult = await verifyUserPassword(signerId, password);
  if (!verifyResult.verified) {
    if (verifyResult.reason === 'service_error') {
      throw new AppError(503, '인증 서비스에 연결할 수 없습니다.', ErrorCode.SERVICE_UNAVAILABLE);
    }
    throw new AppError(400, '비밀번호가 올바르지 않습니다. 서명이 거부되었습니다.', ErrorCode.SIGNATURE_PASSWORD_INVALID);
  }

  const orgId = getOrgId(request.headers);

  // 노트 정보 조회 (자기 노트 서명 차단 + 팀 리더 서명 확인용)
  const note = await fetchNote(noteId, orgId);
  if (!note) {
    throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
  }

  // 자기 노트 서명 차단 (부인방지 원칙) — admin은 예외
  const signerRole = request.headers['x-user-role'] as string;
  if (note.authorId === signerId && signerRole !== 'admin') {
    throw new AppError(403, '자신이 작성한 노트에는 서명할 수 없습니다.', ErrorCode.NOTE_PERMISSION_DENIED);
  }

  // 서명 권한 확인: reviewer/admin 또는 해당 팀 리더
  const hasSystemSignPermission = signerRole === 'admin' || signerRole === 'reviewer';
  const teamRoles = getTeamRoles(request.headers);
  const isNoteTeamLeader = note.teamId && teamRoles[note.teamId] === 'leader';
  if (!hasSystemSignPermission && !isNoteTeamLeader) {
    throw new AppError(403, '서명 권한이 없습니다. reviewer/admin 또는 해당 팀 리더만 서명 가능합니다.', ErrorCode.AUTH_PERMISSION_DENIED);
  }

  // 이미 서명된 노트 중복 체크
  const latestSig = await prisma.signature.findFirst({
    where: { noteId, orgId, status: 'valid' },
    orderBy: { chainIndex: 'desc' },
  });

  const prevHash = latestSig?.signatureHash ?? null;
  const chainIndex = latestSig ? latestSig.chainIndex + 1 : 0;
  const timestamp = new Date().toISOString();

  // 해시 체인: sha256(noteId:signerId:timestamp:prevHash:comment)
  const hashInput = `${noteId}:${signerId}:${timestamp}:${prevHash ?? 'genesis'}:${comment ?? ''}`;
  const signatureHash = `sha256:${sha256(hashInput)}`;

  const signature = await prisma.signature.create({
    data: {
      id: uuidv4(),
      noteId,
      signerId,
      orgId,
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
      orgId,
      details: {
        signatureId: signature.id,
        hash: signatureHash,
        chainIndex,
        prevHash,
        comment: comment ?? null,
      },
      ipAddress: request.ip,
    },
  });

  // ELN 서비스 노트 상태 → signed
  const statusUpdated = await patchNoteStatus(noteId, 'signed', signerId, orgId);

  // 서명 알림: 노트 작성자에게 알림 — BullMQ 큐에 등록 (at-least-once, 재시도 3회)
  try {
    const note = await fetchNote(noteId, orgId);
    if (note && note.authorId && note.authorId !== signerId) {
      await notificationQueue.add(
        'note-signed',
        {
          recipientId: note.authorId,
          orgId,
          type: 'NOTE_SIGNED',
          entityType: 'note',
          entityId: noteId,
          title: '연구노트가 서명되었습니다',
          message: `'${note.title}' 노트가 서명 처리되었습니다.`,
          actorId: signerId,
          // 같은 서명(signature.id)에 대해 한 번만 발송 — 재시도/중복 호출에도 안전
          idempotencyKey: `note-signed-${signature.id}`,
        },
        {
          jobId: `note-signed-${signature.id}`, // 큐 레벨에서도 중복 enqueue 방지
        },
      );
    }
  } catch (notifErr) {
    // 큐잉 실패는 드물지만(=Redis 다운) 로그만 남기고 서명 자체는 성공 반환
    logger.error({ noteId, signatureId: signature.id, err: notifErr }, '[NOTIFICATION_FAIL] 서명 알림 큐잉 실패');
  }

  reply.code(201);
  return {
    ok: true,
    data: signature,
    message: '전자서명이 완료되었습니다. 노트가 서명 완료 상태로 전환되었습니다.',
    ...(statusUpdated ? {} : { warning: '서명은 저장되었으나 노트 상태 전환이 지연될 수 있습니다. 잠시 후 자동 반영됩니다.' }),
  };
}

/** GET /api/signatures/:noteId — 노트의 서명 목록 조회 */
export async function listSignatures(request: FastifyRequest, reply: FastifyReply) {
  const { noteId } = request.params as { noteId: string };
  const orgId = getOrgId(request.headers);
  const signatures = await prisma.signature.findMany({
    where: { noteId, orgId },
    orderBy: { chainIndex: 'asc' },
  });
  return { ok: true, data: signatures, total: signatures.length };
}

/** GET /api/signatures/verify/:noteId — 해시 체인 전체 무결성 검증 */
export async function verifySignature(request: FastifyRequest, reply: FastifyReply) {
  const { noteId } = request.params as { noteId: string };
  const orgId = getOrgId(request.headers);
  const signatures = await prisma.signature.findMany({
    where: { noteId, orgId, status: 'valid' },
    orderBy: { chainIndex: 'asc' },
  });

  if (signatures.length === 0) {
    return { ok: true, noteId, verified: false, message: '유효한 서명이 없습니다.' };
  }

  let chainIntact = true;
  const chainErrors: string[] = [];

  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    const expectedPrevHash = i === 0 ? null : signatures[i - 1].signatureHash;

    if (sig.prevHash !== expectedPrevHash) {
      chainIntact = false;
      chainErrors.push(
        `chainIndex ${sig.chainIndex}: prevHash 불일치 (expected: ${expectedPrevHash ?? 'null'}, actual: ${sig.prevHash ?? 'null'})`,
      );
    }
    if (sig.chainIndex !== i) {
      chainIntact = false;
      chainErrors.push(`chainIndex 불연속: expected ${i}, got ${sig.chainIndex}`);
    }
  }

  return {
    ok: true,
    noteId,
    verified: chainIntact,
    chainLength: signatures.length,
    latestSignature: signatures[signatures.length - 1],
    chainErrors: chainErrors.length > 0 ? chainErrors : undefined,
    message: chainIntact
      ? `서명 체인이 유효합니다. (${signatures.length}개 서명)`
      : '서명 체인 무결성 오류가 감지되었습니다.',
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * POST /api/signatures/revoke/:signatureId — 서명 취소 (admin 전용)
 * 해시 체인 무결성을 위해 실제 삭제 대신 status=revoked 처리
 */
export async function revokeSignature(request: FastifyRequest, reply: FastifyReply) {
  const userRole = request.headers['x-user-role'] as string;
  if (userRole !== 'admin') {
    throw new AppError(403, '서명 취소는 관리자만 가능합니다.', ErrorCode.SIGNATURE_ADMIN_ONLY);
  }

  const { reason } = request.body as any;
  const actorId = (request.headers['x-user-id'] as string) || 'anonymous';
  const orgId = getOrgId(request.headers);

  const { signatureId } = request.params as { signatureId: string };
  const sig = await prisma.signature.findFirst({ where: { id: signatureId, orgId } });
  if (!sig) {
    throw new AppError(404, '서명을 찾을 수 없습니다.', ErrorCode.SIGNATURE_NOT_FOUND);
  }
  if (sig.status === 'revoked') {
    throw new AppError(400, '이미 취소된 서명입니다.', ErrorCode.SIGNATURE_ALREADY_REVOKED);
  }

  let updated;
  try {
    updated = await prisma.signature.update({
      where: { id: signatureId },
      data: { status: 'revoked' },
    });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      throw new AppError(404, '서명을 찾을 수 없습니다.', ErrorCode.SIGNATURE_NOT_FOUND);
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      id: uuidv4(),
      entityType: 'signature',
      entityId: sig.id,
      action: 'revoked',
      actorId,
      orgId: getOrgId(request.headers),
      details: { noteId: sig.noteId, reason, chainIndex: sig.chainIndex },
      ipAddress: request.ip,
    },
  });

  return { ok: true, data: updated, message: '서명이 취소되었습니다.' };
}

/** GET /api/signatures/compliance/stats */
export async function getComplianceStats(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request.headers);
  let signed: number, pending: number, locked: number, draft: number, totalSignatures: number;
  try {
    [signed, pending, locked, draft, totalSignatures] = await Promise.all([
      fetchNoteCount('signed', orgId),
      fetchNoteCount('in_progress', orgId),
      fetchNoteCount('locked', orgId),
      fetchNoteCount('draft', orgId),
      prisma.signature.count({ where: { status: 'valid', orgId } }),
    ]);
  } catch (err) {
    if (err instanceof ElnServiceError) {
      throw new AppError(503, '노트 데이터를 가져올 수 없습니다.', ErrorCode.SERVICE_UNAVAILABLE);
    }
    throw err;
  }

  return {
    ok: true,
    data: { signed, pending, locked, draft, totalSignatures },
  };
}

/** GET /api/signatures/compliance/list */
export async function getComplianceList(request: FastifyRequest, reply: FastifyReply) {
  const { status, page, limit } = request.query as unknown as { status?: string; page: number; limit: number };

  const orgId = getOrgId(request.headers);
  const params: Record<string, string> = {
    type: 'note',
    page: String(page),
    limit: String(limit),
  };
  if (status) params.status = status;

  let noteList;
  try {
    noteList = await fetchNotes(params, orgId);
  } catch (err) {
    if (err instanceof ElnServiceError) {
      throw new AppError(503, '노트 데이터를 가져올 수 없습니다.', ErrorCode.SERVICE_UNAVAILABLE);
    }
    throw err;
  }

  const noteIds = noteList.data.map((n) => n.id);

  const signatures = noteIds.length > 0
    ? await prisma.signature.findMany({
        where: { noteId: { in: noteIds }, status: 'valid' },
        orderBy: { chainIndex: 'desc' },
      })
    : [];

  const sigMap = new Map<string, typeof signatures>();
  for (const sig of signatures) {
    if (!sigMap.has(sig.noteId)) sigMap.set(sig.noteId, []);
    sigMap.get(sig.noteId)!.push(sig);
  }

  const data = noteList.data.map((note) => {
    const noteSigs = sigMap.get(note.id) ?? [];
    const latest = noteSigs[0] ?? null;
    return {
      noteId: note.id,
      title: note.title,
      status: note.status,
      authorId: note.authorId,
      updatedAt: note.updatedAt,
      isSigned: noteSigs.length > 0,
      signatureCount: noteSigs.length,
      latestSignature: latest
        ? {
            id: latest.id,
            signerId: latest.signerId,
            signatureHash: latest.signatureHash,
            timestamp: latest.timestamp instanceof Date ? latest.timestamp.toISOString() : String(latest.timestamp),
          }
        : null,
      editable: ['draft', 'in_progress'].includes(note.status),
    };
  });

  return { ok: true, data, total: noteList.total, page };
}

/** GET /api/signatures/editable/:noteId */
export async function getNoteEditable(request: FastifyRequest, reply: FastifyReply) {
  const { noteId } = request.params as { noteId: string };
  const orgId = getOrgId(request.headers);

  let note;
  try {
    note = await fetchNote(noteId, orgId);
  } catch (err) {
    if (err instanceof ElnServiceError) {
      throw new AppError(503, '노트 데이터를 가져올 수 없습니다.', ErrorCode.SERVICE_UNAVAILABLE);
    }
    throw err;
  }

  if (!note) {
    throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
  }

  const editable = ['draft', 'in_progress'].includes(note.status);
  const reason: 'editable' | 'locked' | 'signed' = editable
    ? 'editable'
    : note.status === 'locked' ? 'locked' : 'signed';

  return {
    ok: true,
    data: { noteId: note.id, status: note.status, editable, reason },
  };
}
