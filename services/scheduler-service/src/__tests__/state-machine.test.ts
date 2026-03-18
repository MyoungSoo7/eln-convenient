import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  InvalidTransitionError,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  isTerminal,
} from '../lib/state-machine';

describe('상태 머신 (state-machine)', () => {
  // ─── canTransition ────────────────────────────────────────
  describe('canTransition - 허용 전이', () => {
    it.each([
      ['PENDING',  'APPROVED'],
      ['PENDING',  'REJECTED'],
      ['PENDING',  'CANCELLED'],
      ['APPROVED', 'COMPLETED'],
      ['APPROVED', 'CANCELLED'],
    ] as const)('%s → %s 허용', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe('canTransition - 불허 전이', () => {
    it.each([
      ['APPROVED',  'PENDING'],
      ['APPROVED',  'REJECTED'],
      ['REJECTED',  'APPROVED'],
      ['REJECTED',  'PENDING'],
      ['CANCELLED', 'APPROVED'],
      ['CANCELLED', 'PENDING'],
      ['COMPLETED', 'APPROVED'],
      ['COMPLETED', 'PENDING'],
      ['COMPLETED', 'CANCELLED'],
    ] as const)('%s → %s 불허', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  // ─── assertTransition ─────────────────────────────────────
  describe('assertTransition', () => {
    it('유효한 전이는 예외 없음', () => {
      expect(() => assertTransition('PENDING', 'APPROVED')).not.toThrow();
      expect(() => assertTransition('APPROVED', 'COMPLETED')).not.toThrow();
    });

    it('유효하지 않은 전이는 InvalidTransitionError 발생', () => {
      expect(() => assertTransition('APPROVED', 'PENDING'))
        .toThrow(InvalidTransitionError);
    });

    it('에러 메시지에 from/to 상태 정보 포함', () => {
      try {
        assertTransition('COMPLETED', 'APPROVED');
        expect.fail('예외가 발생해야 합니다');
      } catch (e: any) {
        expect(e).toBeInstanceOf(InvalidTransitionError);
        expect(e.message).toContain('COMPLETED');
        expect(e.message).toContain('APPROVED');
        expect(e.from).toBe('COMPLETED');
        expect(e.to).toBe('APPROVED');
      }
    });

    it('종단 상태에서 어떤 전이도 InvalidTransitionError 발생', () => {
      const terminalStates = ['REJECTED', 'CANCELLED', 'COMPLETED'] as const;
      terminalStates.forEach((status) => {
        expect(() => assertTransition(status, 'APPROVED')).toThrow(InvalidTransitionError);
        expect(() => assertTransition(status, 'PENDING')).toThrow(InvalidTransitionError);
      });
    });
  });

  // ─── 상수 검증 ────────────────────────────────────────────
  describe('ACTIVE_STATUSES', () => {
    it('PENDING, APPROVED 포함', () => {
      expect(ACTIVE_STATUSES).toContain('PENDING');
      expect(ACTIVE_STATUSES).toContain('APPROVED');
    });

    it('종단 상태 미포함', () => {
      expect(ACTIVE_STATUSES).not.toContain('REJECTED');
      expect(ACTIVE_STATUSES).not.toContain('CANCELLED');
      expect(ACTIVE_STATUSES).not.toContain('COMPLETED');
    });
  });

  describe('TERMINAL_STATUSES', () => {
    it('REJECTED, CANCELLED, COMPLETED 포함', () => {
      expect(TERMINAL_STATUSES).toContain('REJECTED');
      expect(TERMINAL_STATUSES).toContain('CANCELLED');
      expect(TERMINAL_STATUSES).toContain('COMPLETED');
    });
  });

  describe('isTerminal', () => {
    it.each(['REJECTED', 'CANCELLED', 'COMPLETED'] as const)('%s는 종단 상태', (s) => {
      expect(isTerminal(s)).toBe(true);
    });

    it.each(['PENDING', 'APPROVED'] as const)('%s는 비종단 상태', (s) => {
      expect(isTerminal(s)).toBe(false);
    });
  });
});
