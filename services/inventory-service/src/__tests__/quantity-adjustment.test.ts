/**
 * 수량 조정 비즈니스 로직 테스트 (in/out/adjust)
 */

type AdjustType = 'in' | 'out' | 'adjust';

interface AdjustResult {
  newQuantity: number;
  error?: string;
}

function adjustQuantity(
  currentQuantity: number, adjustType: AdjustType, amount: number
): AdjustResult {
  if (amount <= 0) return { newQuantity: currentQuantity, error: '수량은 0보다 커야 합니다' };

  switch (adjustType) {
    case 'in':
      return { newQuantity: currentQuantity + amount };
    case 'out':
      if (currentQuantity < amount) {
        return { newQuantity: currentQuantity, error: `재고 부족: 현재=${currentQuantity}, 요청=${amount}` };
      }
      return { newQuantity: currentQuantity - amount };
    case 'adjust':
      return { newQuantity: amount }; // 절대값으로 설정
    default:
      return { newQuantity: currentQuantity, error: `알 수 없는 조정 유형: ${adjustType}` };
  }
}

describe('Quantity Adjustment', () => {
  it('입고(in)', () => {
    expect(adjustQuantity(10, 'in', 5)).toEqual({ newQuantity: 15 });
  });
  it('출고(out) 성공', () => {
    expect(adjustQuantity(10, 'out', 3)).toEqual({ newQuantity: 7 });
  });
  it('출고(out) 재고 부족', () => {
    const result = adjustQuantity(2, 'out', 5);
    expect(result.error).toContain('재고 부족');
    expect(result.newQuantity).toBe(2);
  });
  it('조정(adjust) 절대값 설정', () => {
    expect(adjustQuantity(10, 'adjust', 25)).toEqual({ newQuantity: 25 });
  });
  it('수량 0이하 에러', () => {
    expect(adjustQuantity(10, 'in', 0).error).toContain('0보다');
    expect(adjustQuantity(10, 'out', -1).error).toContain('0보다');
  });
  it('출고로 재고 0 가능', () => {
    expect(adjustQuantity(5, 'out', 5)).toEqual({ newQuantity: 0 });
  });
});
