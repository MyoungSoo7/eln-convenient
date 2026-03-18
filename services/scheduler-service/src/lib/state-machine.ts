import { BookingStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────
// 상태 전이 테이블
// ─────────────────────────────────────────────────────────────

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING:   ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:  ['COMPLETED', 'CANCELLED'],
  REJECTED:  [],
  CANCELLED: [],
  COMPLETED: [],
};

// ─────────────────────────────────────────────────────────────
// 에러
// ─────────────────────────────────────────────────────────────

export class InvalidTransitionError extends Error {
  readonly from: BookingStatus;
  readonly to: BookingStatus;

  constructor(from: BookingStatus, to: BookingStatus) {
    super(`유효하지 않은 상태 전이: ${from} → ${to}. 가능한 전이: ${TRANSITIONS[from].join(', ') || '없음'}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

/** 전이 가능 여부 확인 (예외 없음) */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** 전이 가능 여부 확인 (불가 시 InvalidTransitionError 발생) */
export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** 활성 상태 (충돌 체크에 포함되는 상태) */
export const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'APPROVED'];

/** 종단 상태 (더 이상 전이 불가) */
export const TERMINAL_STATUSES: BookingStatus[] = ['REJECTED', 'CANCELLED', 'COMPLETED'];

/** 해당 상태가 종단 상태인지 확인 */
export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
