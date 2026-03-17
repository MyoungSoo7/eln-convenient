import { useState, useEffect } from 'react';
import type { CreateItemDto, ItemType } from '../types/inventory';
import { ITEM_TYPE_LABELS } from '../types/inventory';
import { createItem, fetchCategories } from '../api/inventory';
import './AddItemModal.css';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const ITEM_TYPES = Object.entries(ITEM_TYPE_LABELS) as [ItemType, string][];

const INITIAL: CreateItemDto = {
  name: '',
  type: 'reagent',
  category: '',
  quantity: undefined,
  unit: '',
  location: '',
  barcode: '',
  minQuantity: undefined,
  expiryDate: '',
  expiryWarningDays: 30,
  tags: [],
};

export default function AddItemModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<CreateItemDto>(INITIAL);
  const [tagInput, setTagInput] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCategories()
      .then((res) => setCategories(res.data.map((c) => c.name)))
      .catch(() => {/* 카테고리 로드 실패 무시 */});
  }, []);

  function set<K extends keyof CreateItemDto>(key: K, value: CreateItemDto[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    if (!(form.tags ?? []).includes(tag)) {
      set('tags', [...(form.tags ?? []), tag]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    set('tags', (form.tags ?? []).filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('이름은 필수입니다.'); return; }

    const dto: CreateItemDto = {
      name: form.name.trim(),
      type: form.type,
      ...(form.category?.trim() && { category: form.category.trim() }),
      ...(form.quantity !== undefined && { quantity: form.quantity }),
      ...(form.unit?.trim() && { unit: form.unit.trim() }),
      ...(form.location?.trim() && { location: form.location.trim() }),
      ...(form.barcode?.trim() && { barcode: form.barcode.trim() }),
      ...(form.minQuantity !== undefined && { minQuantity: form.minQuantity }),
      ...(form.expiryDate?.trim() && { expiryDate: form.expiryDate }),
      expiryWarningDays: form.expiryWarningDays ?? 30,
      tags: form.tags ?? [],
    };

    setLoading(true);
    try {
      await createItem(dto);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '항목 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>인벤토리 항목 추가</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          {/* 기본 정보 */}
          <section className="form-section">
            <h3>기본 정보</h3>
            <div className="form-row">
              <div className="form-group required">
                <label>항목명</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="예: Ethanol 99.5%"
                  required
                />
              </div>
              <div className="form-group required">
                <label>유형</label>
                <select value={form.type} onChange={(e) => set('type', e.target.value as ItemType)}>
                  {ITEM_TYPES.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>카테고리</label>
                <input
                  type="text"
                  list="category-list"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                  placeholder="카테고리 선택 또는 입력"
                />
                <datalist id="category-list">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>위치</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder="예: B동 냉장고 2번"
                />
              </div>
            </div>

            <div className="form-group">
              <label>바코드</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => set('barcode', e.target.value)}
                placeholder="선택사항 (고유값)"
              />
            </div>
          </section>

          {/* 수량 정보 */}
          <section className="form-section">
            <h3>수량 정보</h3>
            <div className="form-row">
              <div className="form-group">
                <label>초기 수량</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.quantity ?? ''}
                  onChange={(e) => set('quantity', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>단위</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) => set('unit', e.target.value)}
                  placeholder="예: mL, g, 개"
                />
              </div>
              <div className="form-group">
                <label>최소 재고 알림</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.minQuantity ?? ''}
                  onChange={(e) => set('minQuantity', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="미설정"
                />
              </div>
            </div>
          </section>

          {/* 유효기간 */}
          <section className="form-section">
            <h3>유효기간</h3>
            <div className="form-row">
              <div className="form-group">
                <label>유효기간</label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => set('expiryDate', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>만료 경고 (일 전)</label>
                <input
                  type="number"
                  min="1"
                  value={form.expiryWarningDays ?? 30}
                  onChange={(e) => set('expiryWarningDays', Number(e.target.value))}
                />
              </div>
            </div>
          </section>

          {/* 태그 */}
          <section className="form-section">
            <h3>태그</h3>
            <div className="tag-input-row">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="태그 입력 후 Enter"
              />
              <button type="button" className="btn-tag-add" onClick={addTag}>추가</button>
            </div>
            {(form.tags ?? []).length > 0 && (
              <div className="tag-list">
                {(form.tags ?? []).map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '저장 중...' : '항목 추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
