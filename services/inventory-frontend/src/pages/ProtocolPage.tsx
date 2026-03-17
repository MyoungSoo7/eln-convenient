import { useState, useEffect, useCallback } from 'react';
import type { Protocol, ProtocolFilters, NoteStatus } from '../types/protocol';
import {
  NOTE_STATUS_LABELS,
  NOTE_STATUS_COLORS,
} from '../types/protocol';
import { fetchProtocols, deleteProtocol, fetchProtocolStats } from '../api/protocol';
import CreateProtocolModal from '../components/CreateProtocolModal';
import './ProtocolPage.css';

type ModalMode = 'protocol' | 'template';

const NOTE_STATUSES = Object.entries(NOTE_STATUS_LABELS) as [NoteStatus, string][];

const DEFAULT_FILTERS: ProtocolFilters = {
  q: '',
  status: '',
  tag: '',
  page: 1,
  limit: 20,
};

export default function ProtocolPage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<ProtocolFilters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, draft: 0, in_progress: 0, signed: 0 });

  const loadProtocols = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchProtocols({
        q: filters.q || undefined,
        status: filters.status || undefined,
        tag: filters.tag || undefined,
        page: filters.page,
        limit: filters.limit,
      });
      setProtocols(res.data);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadProtocols(); }, [loadProtocols]);

  useEffect(() => {
    fetchProtocolStats()
      .then(setStats)
      .catch(() => {/* 통계 로드 실패 무시 */});
  }, [protocols]);

  function applySearch() {
    setFilters((f) => ({ ...f, q: searchInput, page: 1 }));
  }

  function setFilter<K extends keyof ProtocolFilters>(key: K, value: ProtocolFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }

  async function handleDelete(protocol: Protocol) {
    if (!confirm(`"${protocol.title}" 프로토콜을 삭제하시겠습니까?`)) return;
    setDeletingId(protocol.id);
    try {
      await deleteProtocol(protocol.id);
      await loadProtocols();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const hasFilters = !!(filters.q || filters.status || filters.tag);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div className="protocol-page">
      {/* 헤더 */}
      <header className="page-header">
        <div className="page-header-left">
          <h1>프로토콜 관리</h1>
          <span className="page-subtitle">실험 프로토콜 · SOP · 분석법</span>
        </div>
        <div className="page-header-actions">
          <button
            className="btn-new-secondary"
            onClick={() => setModalMode('template')}
          >
            새 템플릿
          </button>
          <button
            className="btn-new-primary"
            onClick={() => setModalMode('protocol')}
          >
            <span>+</span> 새 프로토콜
          </button>
        </div>
      </header>

      {/* 통계 카드 */}
      <div className="stats-row">
        <div className="stat-card stat-total">
          <span className="stat-label">전체 프로토콜</span>
          <span className="stat-value">{stats.total.toLocaleString()}</span>
        </div>
        <div
          className="stat-card stat-clickable"
          onClick={() => setFilter('status', filters.status === 'draft' ? '' : 'draft')}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">초안</span>
          <span className="stat-value" style={{ color: NOTE_STATUS_COLORS.draft }}>
            {stats.draft}
          </span>
        </div>
        <div
          className="stat-card stat-clickable"
          onClick={() => setFilter('status', filters.status === 'in_progress' ? '' : 'in_progress')}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">진행 중</span>
          <span className="stat-value" style={{ color: NOTE_STATUS_COLORS.in_progress }}>
            {stats.in_progress}
          </span>
        </div>
        <div
          className="stat-card stat-clickable"
          onClick={() => setFilter('status', filters.status === 'signed' ? '' : 'signed')}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">서명 완료</span>
          <span className="stat-value" style={{ color: NOTE_STATUS_COLORS.signed }}>
            {stats.signed}
          </span>
        </div>
      </div>

      {/* 검색 + 필터 바 */}
      <div className="filter-bar">
        <div className="search-group">
          <div className="search-icon">🔍</div>
          <input
            type="text"
            className="search-input"
            placeholder="프로토콜 제목, 태그 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
          />
          <button className="btn-search" onClick={applySearch}>검색</button>
        </div>

        <div className="filter-selects">
          <select
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value as NoteStatus | '')}
          >
            <option value="">모든 상태</option>
            {NOTE_STATUSES.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              className="btn-reset"
              onClick={() => { setSearchInput(''); setFilters(DEFAULT_FILTERS); }}
            >
              필터 초기화
            </button>
          )}
        </div>
      </div>

      {/* 활성 필터 표시 */}
      {hasFilters && (
        <div className="active-filters">
          {filters.q && (
            <span className="active-filter">
              검색: "{filters.q}"
              <button onClick={() => { setSearchInput(''); setFilter('q', ''); }}>✕</button>
            </span>
          )}
          {filters.status && (
            <span className="active-filter">
              상태: {NOTE_STATUS_LABELS[filters.status]}
              <button onClick={() => setFilter('status', '')}>✕</button>
            </span>
          )}
          {filters.tag && (
            <span className="active-filter">
              태그: {filters.tag}
              <button onClick={() => setFilter('tag', '')}>✕</button>
            </span>
          )}
          <span className="filter-result-count">
            {total.toLocaleString()}개 결과
          </span>
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={loadProtocols}>재시도</button>
        </div>
      )}

      {/* 프로토콜 목록 */}
      {loading ? (
        <div className="list-placeholder">
          <span className="loading-spinner" />
          불러오는 중...
        </div>
      ) : protocols.length === 0 ? (
        <div className="list-empty">
          <div className="list-empty-icon">📋</div>
          <p className="list-empty-title">
            {hasFilters ? '검색 결과가 없습니다.' : '아직 등록된 프로토콜이 없습니다.'}
          </p>
          {!hasFilters && (
            <button
              className="btn-new-primary"
              onClick={() => setModalMode('protocol')}
            >
              + 첫 프로토콜 작성하기
            </button>
          )}
        </div>
      ) : (
        <div className="protocol-list">
          {protocols.map((protocol) => (
            <div key={protocol.id} className="protocol-card">
              <div className="protocol-card-header">
                <div className="protocol-card-title-row">
                  <h3 className="protocol-title">{protocol.title}</h3>
                  <span
                    className="protocol-status"
                    style={{
                      color: NOTE_STATUS_COLORS[protocol.status as NoteStatus],
                      background: `${NOTE_STATUS_COLORS[protocol.status as NoteStatus]}14`,
                    }}
                  >
                    {NOTE_STATUS_LABELS[protocol.status as NoteStatus] ?? protocol.status}
                  </span>
                </div>

                {protocol.content && (
                  <p className="protocol-preview">
                    {protocol.content.slice(0, 120)}{protocol.content.length > 120 ? '...' : ''}
                  </p>
                )}
              </div>

              <div className="protocol-card-footer">
                <div className="protocol-meta">
                  {protocol.templateId && (
                    <span className="protocol-meta-item protocol-from-template">
                      📄 템플릿 기반
                    </span>
                  )}
                  <span className="protocol-meta-item">
                    {formatDate(protocol.createdAt)}
                  </span>
                  {protocol.tags.length > 0 && (
                    <div className="protocol-tags">
                      {protocol.tags.slice(0, 4).map((tag) => (
                        <button
                          key={tag}
                          className="protocol-tag"
                          onClick={() => setFilter('tag', filters.tag === tag ? '' : tag)}
                        >
                          {tag}
                        </button>
                      ))}
                      {protocol.tags.length > 4 && (
                        <span className="protocol-tag-more">+{protocol.tags.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>

                <button
                  className="btn-delete"
                  onClick={() => handleDelete(protocol)}
                  disabled={deletingId === protocol.id}
                >
                  {deletingId === protocol.id ? '...' : '삭제'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
            if (totalPages <= 7) pageNum = i + 1;
            else if (filters.page <= 4) pageNum = i + 1;
            else if (filters.page >= totalPages - 3) pageNum = totalPages - 6 + i;
            else pageNum = filters.page - 3 + i;
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

      {/* 모달 */}
      {modalMode !== null && (
        <CreateProtocolModal
          defaultMode={modalMode}
          onClose={() => setModalMode(null)}
          onCreated={() => { setModalMode(null); loadProtocols(); }}
        />
      )}
    </div>
  );
}
