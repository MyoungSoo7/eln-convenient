import { useState, useEffect, useCallback } from 'react';
import type { InventoryItem, ItemFilters, ItemType, ItemStatus } from '../types/inventory';
import {
  ITEM_TYPE_LABELS,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_COLORS,
} from '../types/inventory';
import { fetchItems, deleteItem, fetchAlertCounts } from '../api/inventory';
import AddItemModal from '../components/AddItemModal';
import './InventoryPage.css';

const ITEM_TYPES = Object.entries(ITEM_TYPE_LABELS) as [ItemType, string][];
const ITEM_STATUSES = Object.entries(ITEM_STATUS_LABELS) as [ItemStatus, string][];

const DEFAULT_FILTERS: ItemFilters = {
  q: '',
  type: '',
  status: '',
  category: '',
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<ItemFilters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [alerts, setAlerts] = useState({ expiring: 0, lowStock: 0 });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchItems(filters);
      setItems(res.data);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    fetchAlertCounts()
      .then(setAlerts)
      .catch(() => {/* 알림 로드 실패 무시 */});
  }, [items]);

  function applySearch() {
    setFilters((f) => ({ ...f, q: searchInput, page: 1 }));
  }

  function setFilter<K extends keyof ItemFilters>(key: K, value: ItemFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }

  async function handleDelete(item: InventoryItem) {
    if (!confirm(`"${item.name}" 항목을 삭제하시겠습니까?`)) return;
    setDeletingId(item.id);
    try {
      await deleteItem(item.id);
      await loadItems();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR');
  }

  function formatQuantity(item: InventoryItem) {
    if (item.quantity === null) return '-';
    return `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`;
  }

  return (
    <div className="inventory-page">
      {/* 헤더 */}
      <header className="page-header">
        <div className="page-header-left">
          <h1>인벤토리 관리</h1>
          <span className="page-subtitle">시약 · 샘플 · 장비 · 소모품</span>
        </div>
        <button className="btn-add" onClick={() => setShowModal(true)}>
          <span>+</span> 항목 추가
        </button>
      </header>

      {/* 통계 카드 */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">전체 항목</span>
          <span className="stat-value">{total.toLocaleString()}</span>
        </div>
        <div className={`stat-card ${alerts.expiring > 0 ? 'stat-warn' : ''}`}>
          <span className="stat-label">만료 임박</span>
          <span className="stat-value">{alerts.expiring}</span>
        </div>
        <div className={`stat-card ${alerts.lowStock > 0 ? 'stat-danger' : ''}`}>
          <span className="stat-label">재고 부족</span>
          <span className="stat-value">{alerts.lowStock}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">현재 페이지</span>
          <span className="stat-value">{filters.page} / {totalPages}</span>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="filter-bar">
        <div className="search-group">
          <input
            type="text"
            className="search-input"
            placeholder="이름, 바코드, 위치 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
          />
          <button className="btn-search" onClick={applySearch}>검색</button>
        </div>

        <div className="filter-selects">
          <select
            value={filters.type}
            onChange={(e) => setFilter('type', e.target.value as ItemType | '')}
          >
            <option value="">모든 유형</option>
            {ITEM_TYPES.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value as ItemStatus | '')}
          >
            <option value="">모든 상태</option>
            {ITEM_STATUSES.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          <select
            value={filters.sortBy}
            onChange={(e) => setFilter('sortBy', e.target.value)}
          >
            <option value="createdAt">등록일순</option>
            <option value="updatedAt">수정일순</option>
            <option value="name">이름순</option>
            <option value="quantity">수량순</option>
            <option value="expiryDate">유효기간순</option>
          </select>

          <button
            className="btn-sort-order"
            onClick={() => setFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {filters.sortOrder === 'desc' ? '↓ 내림차순' : '↑ 오름차순'}
          </button>

          {(filters.q || filters.type || filters.status) && (
            <button
              className="btn-reset"
              onClick={() => { setSearchInput(''); setFilters(DEFAULT_FILTERS); }}
            >
              필터 초기화
            </button>
          )}
        </div>
      </div>

      {/* 오류 */}
      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={loadItems}>재시도</button>
        </div>
      )}

      {/* 테이블 */}
      <div className="table-wrapper">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>항목명</th>
              <th>유형</th>
              <th>상태</th>
              <th>카테고리</th>
              <th>수량</th>
              <th>위치</th>
              <th>유효기간</th>
              <th>등록일</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="table-placeholder">
                  <span className="loading-spinner" />
                  불러오는 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="table-placeholder">
                  {filters.q || filters.type || filters.status
                    ? '검색 결과가 없습니다.'
                    : '등록된 인벤토리 항목이 없습니다. 항목 추가 버튼을 눌러 시작하세요.'}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="col-name">
                    <span className="item-name">{item.name}</span>
                    {item.tags.length > 0 && (
                      <div className="item-tags">
                        {item.tags.slice(0, 3).map((t) => (
                          <span key={t} className="item-tag">{t}</span>
                        ))}
                        {item.tags.length > 3 && <span className="item-tag-more">+{item.tags.length - 3}</span>}
                      </div>
                    )}
                  </td>
                  <td>{ITEM_TYPE_LABELS[item.type as ItemType] ?? item.type}</td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ color: ITEM_STATUS_COLORS[item.status as ItemStatus] }}
                    >
                      {ITEM_STATUS_LABELS[item.status as ItemStatus] ?? item.status}
                    </span>
                  </td>
                  <td>{item.category ?? '-'}</td>
                  <td>{formatQuantity(item)}</td>
                  <td>{item.location ?? '-'}</td>
                  <td>{formatDate(item.expiryDate)}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? '...' : '삭제'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setFilter('page', filters.page - 1)}
            disabled={filters.page <= 1}
          >
            이전
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (filters.page <= 4) {
              pageNum = i + 1;
            } else if (filters.page >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = filters.page - 3 + i;
            }
            return (
              <button
                key={pageNum}
                className={filters.page === pageNum ? 'active' : ''}
                onClick={() => setFilter('page', pageNum)}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => setFilter('page', filters.page + 1)}
            disabled={filters.page >= totalPages}
          >
            다음
          </button>
        </div>
      )}

      {/* 항목 추가 모달 */}
      {showModal && (
        <AddItemModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); loadItems(); }}
        />
      )}
    </div>
  );
}
