/**
 * 예약 상태 전환 테스트
 */

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING:   ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:  ['COMPLETED', 'CANCELLED'],
  REJECTED:  [],
  CANCELLED: [],
  COMPLETED: [],
};

function canTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

describe('Booking State Machine', () => {
  it('PENDING → APPROVED 가능', () => {
    expect(canTransition('PENDING', 'APPROVED')).toBe(true);
  });
  it('PENDING → REJECTED 가능', () => {
    expect(canTransition('PENDING', 'REJECTED')).toBe(true);
  });
  it('PENDING → CANCELLED 가능', () => {
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
  });
  it('APPROVED → COMPLETED 가능', () => {
    expect(canTransition('APPROVED', 'COMPLETED')).toBe(true);
  });
  it('APPROVED → CANCELLED 가능', () => {
    expect(canTransition('APPROVED', 'CANCELLED')).toBe(true);
  });
  it('REJECTED → 전환 불가', () => {
    expect(canTransition('REJECTED', 'PENDING')).toBe(false);
    expect(canTransition('REJECTED', 'APPROVED')).toBe(false);
  });
  it('CANCELLED → 전환 불가', () => {
    expect(canTransition('CANCELLED', 'PENDING')).toBe(false);
  });
  it('COMPLETED → 전환 불가', () => {
    expect(canTransition('COMPLETED', 'PENDING')).toBe(false);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
  });
  it('PENDING → COMPLETED 직접 전환 불가', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
  });
});
