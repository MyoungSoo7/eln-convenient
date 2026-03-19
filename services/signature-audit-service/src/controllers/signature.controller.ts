import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import prisma from '../lib/prisma';
import { fetchNoteCount, fetchNotes, fetchNote, ElnServiceError } from '../lib/eln';

const ELN_SERVICE_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

/** auth-service에 비밀번호 검증 요청 */
async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/internal/verify-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-internal-secret': INTERNAL_SECRET,
    },
    body: JSON.stringify({ userId, password }),
  });
  if (!res.ok) return false;
  const body = await res.json() as any;
  return body.verified === true;
}

/** SHA-256 해시 계산 */
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * ELN 서비스에 노트 상태 변경 요청
 * 서명 완료 후 note.status = 'signed' 로 전환
 */
async function patchNoteStatus(noteId: string, status: string, userId: string): Promise<void> {
  try {
    const res = await fetch(`${ELN_SERVICE_URL}/api/notes/${noteId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-user-id': userId,
        'x-user-role': 'system',
        'x-user-permissions': JSON.stringify(['note:write']),
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[signature] ELN 상태 변경 실패 (${res.status}): ${body}`);
    }
  } catch (err) {
    // ELN 서비스 호출 실패는 서명 자체를 막지 않음 (최선 노력)
    console.warn('[signature] ELN 서비스 상태 변경 호출 오류:', err);
  }
}

// ─────────────────────────────────────────────
// 전자서명
// ─────────────────────────────────────────────

/** POST /api/signatures/sign/:noteId */
export async function signNote(req: Request, res: Response): Promise<void> {
  const signerId = (req.headers['x-user-id'] as string) || 'anonymous';
  const { noteId } = req.params;
  const { comment, password } = req.body;

  try {
    // 비밀번호 검증 (제공된 경우 필수 확인)
    if (password) {
      const verified = await verifyUserPassword(signerId, password);
      if (!verified) {
        res.status(400).json({ ok: false, error: '비밀번호가 올바르지 않습니다. 서명이 거부되었습니다.' });
        return;
      }
    }

    // 이미 서명된 노트 중복 체크
    const latestSig = await prisma.signature.findFirst({
      where: { noteId, status: 'valid' },
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
          hash: signatureHash,
          chainIndex,
          prevHash,
          comment: comment ?? null,
        },
        ipAddress: req.ip,
      },
    });

    // ELN 서비스 노트 상태 → signed
    await patchNoteStatus(noteId, 'signed', signerId);

    // 서명 알림: 노트 작성자에게 알림
    try {
      const note = await fetchNote(noteId);
      if (note && note.authorId && note.authorId !== signerId) {
        await prisma.notification.create({
          data: {
            id: uuidv4(),
            recipientId: note.authorId,
            type: 'NOTE_SIGNED',
            entityType: 'note',
            entityId: noteId,
            title: '연구노트가 서명되었습니다',
            message: `'${note.title}' 노트가 서명 처리되었습니다.`,
            actorId: signerId,
          },
        });
      }
    } catch (notifErr) {
      console.error('[NOTIFICATION_WARN] 서명 알림 실패', { noteId, err: notifErr });
    }

    res.status(201).json({
      ok: true,
      data: signature,
      message: '전자서명이 완료되었습니다. 노트가 서명 완료 상태로 전환되었습니다.',
    });
  } catch (err) {
    console.error('[signNote]', err);
    res.status(500).json({ ok: false, error: '전자서명 처리 중 오류가 발생했습니다.' });
  }
}

/** GET /api/signatures/:noteId — 노트의 서명 목록 조회 */
export async function listSignatures(req: Request, res: Response): Promise<void> {
  const { noteId } = req.params;
  try {
    const signatures = await prisma.signature.findMany({
      where: { noteId },
      orderBy: { chainIndex: 'asc' },
    });
    res.json({ ok: true, data: signatures, total: signatures.length });
  } catch (err) {
    console.error('[listSignatures]', err);
    res.status(500).json({ ok: false, error: '서명 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/signatures/verify/:noteId — 해시 체인 전체 무결성 검증 */
export async function verifySignature(req: Request, res: Response): Promise<void> {
  const { noteId } = req.params;
  try {
    const signatures = await prisma.signature.findMany({
      where: { noteId, status: 'valid' },
      orderBy: { chainIndex: 'asc' },
    });

    if (signatures.length === 0) {
      res.json({ ok: true, noteId, verified: false, message: '유효한 서명이 없습니다.' });
      return;
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

    res.json({
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
    });
  } catch (err) {
    console.error('[verifySignature]', err);
    res.status(500).json({ ok: false, error: '서명 검증 중 오류가 발생했습니다.' });
  }
}

/**
 * POST /api/signatures/revoke/:signatureId — 서명 취소 (admin 전용)
 * 해시 체인 무결성을 위해 실제 삭제 대신 status=revoked 처리
 */
export async function revokeSignature(req: Request, res: Response): Promise<void> {
  const userRole = req.headers['x-user-role'] as string;
  if (userRole !== 'admin') {
    res.status(403).json({ ok: false, error: '서명 취소는 관리자만 가능합니다.' });
    return;
  }

  const { reason } = req.body;
  const actorId = (req.headers['x-user-id'] as string) || 'anonymous';

  try {
    const sig = await prisma.signature.findUnique({ where: { id: req.params.signatureId } });
    if (!sig) {
      res.status(404).json({ ok: false, error: '서명을 찾을 수 없습니다.' });
      return;
    }
    if (sig.status === 'revoked') {
      res.status(400).json({ ok: false, error: '이미 취소된 서명입니다.' });
      return;
    }

    const updated = await prisma.signature.update({
      where: { id: req.params.signatureId },
      data: { status: 'revoked' },
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        entityType: 'signature',
        entityId: sig.id,
        action: 'revoked',
        actorId,
        details: { noteId: sig.noteId, reason, chainIndex: sig.chainIndex },
        ipAddress: req.ip,
      },
    });

    res.json({ ok: true, data: updated, message: '서명이 취소되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '서명을 찾을 수 없습니다.' });
      return;
    }
    console.error('[revokeSignature]', err);
    res.status(500).json({ ok: false, error: '서명 취소 중 오류가 발생했습니다.' });
  }
}

/** GET /api/signatures/compliance/stats */
export async function getComplianceStats(_req: Request, res: Response): Promise<void> {
  try {
    const [signed, pending, locked, draft, totalSignatures] = await Promise.all([
      fetchNoteCount('signed'),
      fetchNoteCount('in_progress'),
      fetchNoteCount('locked'),
      fetchNoteCount('draft'),
      prisma.signature.count({ where: { status: 'valid' } }),
    ]);

    res.json({
      ok: true,
      data: { signed, pending, locked, draft, totalSignatures },
    });
  } catch (err) {
    if (err instanceof ElnServiceError) {
      res.status(503).json({ ok: false, error: '노트 데이터를 가져올 수 없습니다.' });
      return;
    }
    console.error('[getComplianceStats]', err);
    res.status(500).json({ ok: false, error: '컴플라이언스 통계 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/signatures/compliance/list */
export async function getComplianceList(req: Request, res: Response): Promise<void> {
  const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };

  try {
    const params: Record<string, string> = {
      type: 'note',
      page: String(page),
      limit: String(limit),
    };
    if (status) params.status = status;

    const noteList = await fetchNotes(params);
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

    res.json({ ok: true, data, total: noteList.total, page });
  } catch (err) {
    if (err instanceof ElnServiceError) {
      res.status(503).json({ ok: false, error: '노트 데이터를 가져올 수 없습니다.' });
      return;
    }
    console.error('[getComplianceList]', err);
    res.status(500).json({ ok: false, error: '서명 현황 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/signatures/editable/:noteId */
export async function getNoteEditable(req: Request, res: Response): Promise<void> {
  const { noteId } = req.params;
  try {
    const note = await fetchNote(noteId);
    if (!note) {
      res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' });
      return;
    }

    const editable = ['draft', 'in_progress'].includes(note.status);
    const reason: 'editable' | 'locked' | 'signed' = editable
      ? 'editable'
      : note.status === 'locked' ? 'locked' : 'signed';

    res.json({
      ok: true,
      data: { noteId: note.id, status: note.status, editable, reason },
    });
  } catch (err) {
    if (err instanceof ElnServiceError) {
      res.status(503).json({ ok: false, error: '노트 데이터를 가져올 수 없습니다.' });
      return;
    }
    console.error('[getNoteEditable]', err);
    res.status(500).json({ ok: false, error: '수정 가능 여부 조회 중 오류가 발생했습니다.' });
  }
}
