/**
 * 크로스 서비스 이벤트 정의
 *
 * 서비스 간 데이터 정합성을 위한 이벤트 타입과 발행 유틸.
 * Redis Stream 또는 HTTP 콜백으로 전달.
 *
 * 예: 사용자 삭제 시 auth-service → eln/inventory/search 등에 전파하여
 *     관련 데이터를 비활성화하거나 anonymize 처리.
 */

// ── 이벤트 타입 ──

export const ServiceEventType = {
  USER_DELETED: 'user.deleted',
  USER_SUSPENDED: 'user.suspended',
  USER_REACTIVATED: 'user.reactivated',
  NOTE_DELETED: 'note.deleted',
  NOTE_SIGNED: 'note.signed',
} as const;

export type ServiceEventType = (typeof ServiceEventType)[keyof typeof ServiceEventType];

export interface ServiceEvent<T = unknown> {
  type: ServiceEventType;
  sourceService: string;
  entityId: string;
  payload: T;
  timestamp: string;
}

// ── 이벤트 페이로드 타입 ──

export interface UserDeletedPayload {
  userId: string;
  orgId: string;
}

export interface UserSuspendedPayload {
  userId: string;
  orgId: string;
  reason?: string;
}

export interface NoteDeletedPayload {
  noteId: string;
  authorId: string;
}

export interface NoteSignedPayload {
  noteId: string;
  signerId: string;
  signatureId: string;
}

// ── 이벤트 빌더 ──

export function buildServiceEvent<T>(
  type: ServiceEventType,
  sourceService: string,
  entityId: string,
  payload: T,
): ServiceEvent<T> {
  return {
    type,
    sourceService,
    entityId,
    payload,
    timestamp: new Date().toISOString(),
  };
}
