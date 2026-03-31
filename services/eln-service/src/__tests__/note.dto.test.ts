import {
  ALLOWED_STATUS_TRANSITIONS,
  SYSTEM_STATUS_TRANSITIONS,
} from '../dtos/note.dto';

describe('Note Status Transitions', () => {
  describe('ALLOWED_STATUS_TRANSITIONS (일반 사용자)', () => {
    it('draft → in_progress 가능', () => {
      expect(ALLOWED_STATUS_TRANSITIONS.draft).toContain('in_progress');
    });

    it('in_progress → draft 가능', () => {
      expect(ALLOWED_STATUS_TRANSITIONS.in_progress).toContain('draft');
    });

    it('in_progress → locked 가능', () => {
      expect(ALLOWED_STATUS_TRANSITIONS.in_progress).toContain('locked');
    });

    it('signed → 아무것도 전환 불가', () => {
      expect(ALLOWED_STATUS_TRANSITIONS.signed).toEqual([]);
    });

    it('locked → 아무것도 전환 불가 (일반 사용자)', () => {
      expect(ALLOWED_STATUS_TRANSITIONS.locked).toEqual([]);
    });

    it('draft → signed 직접 전환 불가', () => {
      expect(ALLOWED_STATUS_TRANSITIONS.draft).not.toContain('signed');
    });

    it('in_progress → signed 직접 전환 불가', () => {
      expect(ALLOWED_STATUS_TRANSITIONS.in_progress).not.toContain('signed');
    });
  });

  describe('SYSTEM_STATUS_TRANSITIONS (시스템/서명 서비스)', () => {
    it('in_progress → signed 가능 (시스템만)', () => {
      expect(SYSTEM_STATUS_TRANSITIONS.in_progress).toContain('signed');
    });

    it('in_progress → locked 가능', () => {
      expect(SYSTEM_STATUS_TRANSITIONS.in_progress).toContain('locked');
    });

    it('signed → 전환 불가 (시스템도)', () => {
      expect(SYSTEM_STATUS_TRANSITIONS.signed).toEqual([]);
    });
  });
});
