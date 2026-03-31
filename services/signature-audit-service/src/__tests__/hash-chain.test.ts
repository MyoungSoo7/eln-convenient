/**
 * 해시체인 서명 무결성 테스트
 */
import crypto from 'crypto';

function computeSignatureHash(
  noteId: string, signerId: string, timestamp: string,
  prevHash: string, comment: string
): string {
  const payload = `${noteId}:${signerId}:${timestamp}:${prevHash}:${comment}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

describe('Hash Chain Signature', () => {
  const noteId = 'note-001';
  const signerId = 'user-001';
  const timestamp = '2026-03-30T12:00:00Z';
  const prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const comment = '1차 검토 승인';

  it('동일 입력에 동일 해시', () => {
    const hash1 = computeSignatureHash(noteId, signerId, timestamp, prevHash, comment);
    const hash2 = computeSignatureHash(noteId, signerId, timestamp, prevHash, comment);
    expect(hash1).toBe(hash2);
  });

  it('SHA-256 64자 hex', () => {
    const hash = computeSignatureHash(noteId, signerId, timestamp, prevHash, comment);
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it('입력 변경 시 해시 변경', () => {
    const original = computeSignatureHash(noteId, signerId, timestamp, prevHash, comment);
    const tampered = computeSignatureHash(noteId, signerId, timestamp, prevHash, '변조된 코멘트');
    expect(original).not.toBe(tampered);
  });

  it('체인 연결: 이전 해시가 다르면 결과 다름', () => {
    const hash1 = computeSignatureHash(noteId, signerId, timestamp, prevHash, comment);
    const hash2 = computeSignatureHash(noteId, signerId, timestamp, hash1, '2차 검토');
    expect(hash1).not.toBe(hash2);
    // 체인 검증: hash2는 hash1에 의존
    const verify = computeSignatureHash(noteId, signerId, timestamp, hash1, '2차 검토');
    expect(verify).toBe(hash2);
  });

  it('빈 코멘트도 유효', () => {
    const hash = computeSignatureHash(noteId, signerId, timestamp, prevHash, '');
    expect(hash).toHaveLength(64);
  });
});
