/**
 * 인벤토리 도메인 로직 테스트
 */

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  minQuantity: number;
  status: 'active' | 'archived';
  expiresAt?: Date;
}

function isLowStock(item: InventoryItem): boolean {
  return item.quantity <= item.minQuantity && item.quantity > 0;
}

function isOutOfStock(item: InventoryItem): boolean {
  return item.quantity === 0;
}

function isExpired(item: InventoryItem, now: Date = new Date()): boolean {
  return item.expiresAt != null && item.expiresAt < now;
}

function canDecrease(item: InventoryItem, quantity: number): boolean {
  return item.status === 'active' && item.quantity >= quantity && quantity > 0;
}

describe('Inventory Domain Logic', () => {
  const item: InventoryItem = {
    id: '1', name: '에탄올', quantity: 5, minQuantity: 3, status: 'active',
  };

  it('재고 부족 판별', () => {
    expect(isLowStock(item)).toBe(true);
    expect(isLowStock({ ...item, quantity: 10 })).toBe(false);
    expect(isLowStock({ ...item, quantity: 0 })).toBe(false);
  });

  it('재고 소진 판별', () => {
    expect(isOutOfStock(item)).toBe(false);
    expect(isOutOfStock({ ...item, quantity: 0 })).toBe(true);
  });

  it('유효기간 만료 판별', () => {
    const expired = { ...item, expiresAt: new Date('2020-01-01') };
    expect(isExpired(expired)).toBe(true);
    const valid = { ...item, expiresAt: new Date('2099-01-01') };
    expect(isExpired(valid)).toBe(false);
    expect(isExpired(item)).toBe(false); // no expiry
  });

  it('수량 감소 가능 여부', () => {
    expect(canDecrease(item, 3)).toBe(true);
    expect(canDecrease(item, 5)).toBe(true);
    expect(canDecrease(item, 6)).toBe(false);
    expect(canDecrease(item, 0)).toBe(false);
    expect(canDecrease({ ...item, status: 'archived' }, 1)).toBe(false);
  });
});
