import { useState, useEffect, useCallback } from 'react';
import type { Protocol, Template, ProtocolFilters, TemplateFilters, NoteStatus } from '../types/protocol';
import { NOTE_STATUS_LABELS, NOTE_STATUS_COLORS } from '../types/protocol';
import {
  fetchProtocols,
  deleteProtocol,
  fetchProtocolStats,
  fetchTemplates,
  deleteTemplate,
  copyTemplate,
} from '../api/protocol';
import CreateProtocolModal from '../components/CreateProtocolModal';
import './ProtocolPage.css';

type Tab = 'protocol' | 'template';
type ModalMode = 'protocol' | 'template';
const NOTE_STATUSES = Object.entries(NOTE_STATUS_LABELS) as [NoteStatus, string][];
const CATEGORIES = ['일반', '실험법', '분석법', '품질관리', 'SOP', '안전절차'];

const DEFAULT_P_FILTERS: ProtocolFilters = { q: '', status: '', tag: '', page: 1, limit: 20 };
const DEFAULT_T_FILTERS: TemplateFilters = {
  search: '', category: '', publicOnly: false, sortBy: 'createdAt', page: 1, limit: 20,
};

export default function ProtocolPage() {
  const [tab, setTab] = useState<Tab>('protocol');

  // ── 프로토콜 상태 ──
  const [protocols, setProtocols]     = useState<Protocol[]>([]);
  const [pTotal, setPTotal]           = useState(0);
  const [pLoading, setPLoading]       = useState(false);
  const [pError, setPError]           = useState('');
  const [pFilters, setPFilters]       = useState<ProtocolFilters>(DEFAULT_P_FILTERS);
  const [pSearchInput, setPSearchInput] = useState('');
  const [stats, setStats]             = useState({ total: 0, draft: 0, in_progress: 0, signed: 0, locked: 0 });
  const [deletingPId, setDeletingPId] = useState<string | null>(null);

  // ── 템플릿 상태 ──
  const [templates, setTemplates]     = useState<Template[]>([]);
  const [tTotal, setTTotal]           = useState(0);
  const [tLoading, setTLoading]       = useState(false);
  const [tError, setTError]           = useState('');
  const [tFilters, setTFilters]       = useState<TemplateFilters>(DEFAULT_T_FILTERS);
  const [tSearchInput, setTSearchInput] = useState('');
  const [deletingTId, setDeletingTId] = useState<string | null>(null);
  const [copyingId, setCopyingId]     = useState<string | null>(null);

  // ── 모달 ──
  const [modalMode, setModalMode]     = useState<ModalMode | null>(null);

  // ─── 프로토콜 로드 ────────────────────────────────────────
  const loadProtocols = useCallback(async () => {
    setPLoading(true); setPError('');
    try {
      const res = await fetchProtocols({
        q: pFilters.q || undefined,
        status: pFilters.status || undefined,
        tag: pFilters.tag || undefined,
        page: pFilters.page, limit: pFilters.limit,
      });
      setProtocols(res.data); setPTotal(res.total);
    } catch (e: unknown) {
      setPError(e instanceof Error ? e.message : '불러오기 실패');
    } finally { setPLoading(false); }
  }, [pFilters]);

  useEffect(() => { loadProtocols(); }, [loadProtocols]);

  useEffect(() => {
    fetchProtocolStats().then(setStats).catch(() => {});
  }, [protocols]);

  // ─── 템플릿 로드 ──────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setTLoading(true); setTError('');
    try {
      const res = await fetchTemplates({
        search: tFilters.search || undefined,
        category: tFilters.category || undefined,
        publicOnly: tFilters.publicOnly || undefined,
        sortBy: tFilters.sortBy,
        page: tFilters.page, limit: tFilters.limit,
      });
      setTemplates(res.data); setTTotal(res.total);
    } catch (e: unknown) {
      setTError(e instanceof Error ? e.message : '불러오기 실패');
    } finally { setTLoading(false); }
  }, [tFilters]);

  useEffect(() => {
    if (tab === 'template') loadTemplates();
  }, [tab, loadTemplates]);

  // ─── 핸들러 ──────────────────────────────────────────────
  function setPFilter<K extends keyof ProtocolFilters>(k: K, v: ProtocolFilters[K]) {
    setPFilters((f) => ({ ...f, [k]: v, page: 1 }));
  }
  function setTFilter<K extends keyof TemplateFilters>(k: K, v: TemplateFilters[K]) {
    setTFilters((f) => ({ ...f, [k]: v, page: 1 }));
  }

  async function handleDeleteProtocol(p: Protocol) {
    if (!confirm(`"${p.title}" 프로토콜을 삭제하시겠습니까?`)) return;
    setDeletingPId(p.id);
    try { await deleteProtocol(p.id); await loadProtocols(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : '삭제 실패'); }
    finally { setDeletingPId(null); }
  }

  async function handleDeleteTemplate(t: Template) {
    if (!confirm(`"${t.title}" 템플릿을 삭제하시겠습니까?`)) return;
    setDeletingTId(t.id);
    try { await deleteTemplate(t.id); await loadTemplates(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : '삭제 실패'); }
    finally { setDeletingTId(null); }
  }

  async function handleCopyTemplate(t: Template) {
    setCopyingId(t.id);
    try {
      await copyTemplate(t.id);
      await loadTemplates();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : '복사 실패'); }
    finally { setCopyingId(null); }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const pTotalPages = Math.max(1, Math.ceil(pTotal / pFilters.limit));
  const tTotalPages = Math.max(1, Math.ceil(tTotal / tFilters.limit));
  const pHasFilter  = !!(pFilters.q || pFilters.status || pFilters.tag);
  const tHasFilter  = !!(tFilters.search || tFilters.category || tFilters.publicOnly);

  return (
    <div className="protocol-page">
      {/* 헤더 */}
      <header className="page-header">
        <div className="page-header-left">
          <h1>프로토콜 · 템플릿</h1>
          <span className="page-subtitle">실험 프로토콜 · SOP · 재사용 템플릿</span>
        </div>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => { setModalMode('template'); }}>
            + 새 템플릿
          </button>
          <button className="btn-primary" onClick={() => { setModalMode('protocol'); }}>
            + 새 프로토콜
          </button>
        </div>
      </header>

      {/* 탭 */}
      <div className="page-tabs">
        <button
          className={`page-tab ${tab === 'protocol' ? 'active' : ''}`}
          onClick={() => setTab('protocol')}
        >
          프로토콜
          <span className="tab-badge">{stats.total}</span>
        </button>
        <button
          className={`page-tab ${tab === 'template' ? 'active' : ''}`}
          onClick={() => { setTab('template'); }}
        >
          템플릿
          <span className="tab-badge">{tTotal}</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════
          (1)(2) 프로토콜 탭
          ══════════════════════════════════════════════ */}
      {tab === 'protocol' && (
        <>
          {/* 통계 카드 */}
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-label">전체</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            {[
              { key: 'draft' as NoteStatus,       label: '초안' },
              { key: 'in_progress' as NoteStatus, label: '진행 중' },
              { key: 'signed' as NoteStatus,      label: '서명 완료' },
            ].map(({ key, label }) => (
              <div
                key={key}
                className={`stat-card stat-clickable ${pFilters.status === key ? 'stat-active' : ''}`}
                onClick={() => setPFilter('status', pFilters.status === key ? '' : key)}
                role="button" tabIndex={0}
              >
                <span className="stat-label">{label}</span>
                <span className="stat-value" style={{ color: NOTE_STATUS_COLORS[key] }}>
                  {stats[key]}
                </span>
              </div>
            ))}
          </div>

          {/* (2) 검색·필터 */}
          <div className="filter-bar">
            <div className="search-group">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder="제목, 내용, 태그 검색..."
                value={pSearchInput}
                onChange={(e) => setPSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setPFilter('q', pSearchInput)}
              />
              <button className="btn-search" onClick={() => setPFilter('q', pSearchInput)}>검색</button>
            </div>
            <div className="filter-selects">
              <select value={pFilters.status} onChange={(e) => setPFilter('status', e.target.value as NoteStatus | '')}>
                <option value="">모든 상태</option>
                {NOTE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {pHasFilter && (
                <button className="btn-reset" onClick={() => { setPSearchInput(''); setPFilters(DEFAULT_P_FILTERS); }}>
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 활성 필터 뱃지 */}
          {pHasFilter && (
            <div className="active-filters">
              {pFilters.q && (
                <span className="active-filter">
                  "{pFilters.q}" <button onClick={() => { setPSearchInput(''); setPFilter('q', ''); }}>✕</button>
                </span>
              )}
              {pFilters.status && (
                <span className="active-filter">
                  {NOTE_STATUS_LABELS[pFilters.status]} <button onClick={() => setPFilter('status', '')}>✕</button>
                </span>
              )}
              <span className="filter-count">{pTotal}개 결과</span>
            </div>
          )}

          {pError && <div className="error-bar"><span>{pError}</span><button onClick={loadProtocols}>재시도</button></div>}

          {/* 프로토콜 목록 */}
          {pLoading ? (
            <div className="list-loading"><span className="spinner" />불러오는 중...</div>
          ) : protocols.length === 0 ? (
            <div className="list-empty">
              <div className="list-empty-icon">📋</div>
              <p>{pHasFilter ? '검색 결과가 없습니다.' : '등록된 프로토콜이 없습니다.'}</p>
              {!pHasFilter && (
                <button className="btn-primary" onClick={() => setModalMode('protocol')}>+ 첫 프로토콜 작성</button>
              )}
            </div>
          ) : (
            <div className="protocol-list">
              {protocols.map((p) => (
                <div key={p.id} className="protocol-card">
                  <div className="protocol-card-top">
                    <div className="protocol-title-row">
                      <h3 className="protocol-title">{p.title}</h3>
                      <span
                        className="status-badge"
                        style={{
                          color: NOTE_STATUS_COLORS[p.status as NoteStatus],
                          background: `${NOTE_STATUS_COLORS[p.status as NoteStatus]}18`,
                        }}
                      >
                        {NOTE_STATUS_LABELS[p.status as NoteStatus]}
                      </span>
                    </div>
                    {p.content && (
                      <p className="protocol-preview">
                        {p.content.slice(0, 130)}{p.content.length > 130 ? '...' : ''}
                      </p>
                    )}
                  </div>
                  <div className="protocol-card-footer">
                    <div className="protocol-meta">
                      {p.templateId && <span className="meta-badge meta-template">📄 템플릿 기반</span>}
                      <span className="meta-date">{formatDate(p.createdAt)}</span>
                      {p.tags.length > 0 && (
                        <div className="tag-row">
                          {p.tags.slice(0, 4).map((t) => (
                            <button
                              key={t} className="tag-chip"
                              onClick={() => setPFilter('tag', pFilters.tag === t ? '' : t)}
                            >
                              {t}
                            </button>
                          ))}
                          {p.tags.length > 4 && <span className="tag-more">+{p.tags.length - 4}</span>}
                        </div>
                      )}
                    </div>
                    <button
                      className="btn-danger-sm"
                      onClick={() => handleDeleteProtocol(p)}
                      disabled={deletingPId === p.id}
                    >
                      {deletingPId === p.id ? '...' : '삭제'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 페이지네이션 */}
          <Pagination page={pFilters.page} total={pTotalPages} onChange={(n) => setPFilter('page', n)} />
        </>
      )}

      {/* ══════════════════════════════════════════════
          (1)(2)(3)(4) 템플릿 탭
          ══════════════════════════════════════════════ */}
      {tab === 'template' && (
        <>
          {/* (2) 템플릿 검색·필터 */}
          <div className="filter-bar">
            <div className="search-group">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder="템플릿 제목, 설명, 태그 검색..."
                value={tSearchInput}
                onChange={(e) => setTSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setTFilter('search', tSearchInput)}
              />
              <button className="btn-search" onClick={() => setTFilter('search', tSearchInput)}>검색</button>
            </div>
            <div className="filter-selects">
              <select value={tFilters.category} onChange={(e) => setTFilter('category', e.target.value)}>
                <option value="">모든 카테고리</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={tFilters.sortBy}
                onChange={(e) => setTFilter('sortBy', e.target.value as TemplateFilters['sortBy'])}
              >
                <option value="createdAt">최신순</option>
                <option value="useCount">사용 많은 순</option>
                <option value="copyCount">복사 많은 순</option>
                <option value="title">이름순</option>
              </select>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={tFilters.publicOnly}
                  onChange={(e) => setTFilter('publicOnly', e.target.checked)}
                />
                공개만
              </label>
              {tHasFilter && (
                <button className="btn-reset" onClick={() => { setTSearchInput(''); setTFilters(DEFAULT_T_FILTERS); }}>
                  초기화
                </button>
              )}
            </div>
          </div>

          {tHasFilter && (
            <div className="active-filters">
              {tFilters.search && <span className="active-filter">"{tFilters.search}" <button onClick={() => { setTSearchInput(''); setTFilter('search', ''); }}>✕</button></span>}
              {tFilters.category && <span className="active-filter">{tFilters.category} <button onClick={() => setTFilter('category', '')}>✕</button></span>}
              {tFilters.publicOnly && <span className="active-filter">공개만 <button onClick={() => setTFilter('publicOnly', false)}>✕</button></span>}
              <span className="filter-count">{tTotal}개 결과</span>
            </div>
          )}

          {tError && <div className="error-bar"><span>{tError}</span><button onClick={loadTemplates}>재시도</button></div>}

          {/* (2) 템플릿 목록 */}
          {tLoading ? (
            <div className="list-loading"><span className="spinner" />불러오는 중...</div>
          ) : templates.length === 0 ? (
            <div className="list-empty">
              <div className="list-empty-icon">📂</div>
              <p>{tHasFilter ? '검색 결과가 없습니다.' : '등록된 템플릿이 없습니다.'}</p>
              {!tHasFilter && (
                <button className="btn-primary" onClick={() => setModalMode('template')}>+ 첫 템플릿 만들기</button>
              )}
            </div>
          ) : (
            <div className="template-grid">
              {templates.map((t) => (
                <div key={t.id} className={`template-card ${t.copiedFromId ? 'is-copy' : ''}`}>
                  {/* 헤더 */}
                  <div className="tpl-card-header">
                    <div className="tpl-title-row">
                      <h3 className="tpl-title">{t.title}</h3>
                      <div className="tpl-badges">
                        {t.category && t.category !== '일반' && (
                          <span className="tpl-badge-cat">{t.category}</span>
                        )}
                        <span className={`tpl-badge-vis ${t.isPublic ? 'public' : 'private'}`}>
                          {t.isPublic ? '공개' : '비공개'}
                        </span>
                        {t.copiedFromId && <span className="tpl-badge-copy">복사본</span>}
                      </div>
                    </div>
                    {t.description && <p className="tpl-desc">{t.description}</p>}
                  </div>

                  {/* (4) 카운트 통계 */}
                  <div className="tpl-stats">
                    <div className="tpl-stat">
                      <span className="tpl-stat-icon">📝</span>
                      <span className="tpl-stat-num">{t.useCount}</span>
                      <span className="tpl-stat-label">노트 생성</span>
                    </div>
                    <div className="tpl-stat-divider" />
                    <div className="tpl-stat">
                      <span className="tpl-stat-icon">📋</span>
                      <span className="tpl-stat-num">{t.copyCount}</span>
                      <span className="tpl-stat-label">복사됨</span>
                    </div>
                    <div className="tpl-stat-divider" />
                    <div className="tpl-stat">
                      <span className="tpl-stat-icon">🏷️</span>
                      <span className="tpl-stat-num">{t.tags.length}</span>
                      <span className="tpl-stat-label">태그</span>
                    </div>
                  </div>

                  {/* 태그 */}
                  {t.tags.length > 0 && (
                    <div className="tpl-tags">
                      {t.tags.slice(0, 5).map((tag) => (
                        <span key={tag} className="tpl-tag">{tag}</span>
                      ))}
                      {t.tags.length > 5 && <span className="tpl-tag-more">+{t.tags.length - 5}</span>}
                    </div>
                  )}

                  {/* 메타 */}
                  <div className="tpl-meta">
                    <span>{formatDate(t.createdAt)}</span>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="tpl-actions">
                    {/* (3) 템플릿 복사 버튼 */}
                    <button
                      className="btn-copy"
                      onClick={() => handleCopyTemplate(t)}
                      disabled={copyingId === t.id}
                      title="이 템플릿을 복사해 새 템플릿으로 저장합니다"
                    >
                      {copyingId === t.id ? '복사 중...' : '📋 복사'}
                    </button>
                    <button
                      className="btn-use"
                      onClick={() => {
                        setModalMode('protocol');
                      }}
                      title="이 템플릿으로 새 프로토콜 작성"
                    >
                      ➕ 프로토콜 작성
                    </button>
                    <button
                      className="btn-danger-sm"
                      onClick={() => handleDeleteTemplate(t)}
                      disabled={deletingTId === t.id}
                    >
                      {deletingTId === t.id ? '...' : '삭제'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 페이지네이션 */}
          <Pagination page={tFilters.page} total={tTotalPages} onChange={(n) => setTFilter('page', n)} />
        </>
      )}

      {/* 생성 모달 */}
      {modalMode !== null && (
        <CreateProtocolModal
          defaultMode={modalMode}
          onClose={() => setModalMode(null)}
          onCreated={() => {
            setModalMode(null);
            if (tab === 'protocol') loadProtocols();
            else loadTemplates();
          }}
        />
      )}
    </div>
  );
}

/* ── 공통 페이지네이션 컴포넌트 ─────────────── */
function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (n: number) => void }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: Math.min(total, 7) }, (_, i) => {
    if (total <= 7) return i + 1;
    if (page <= 4) return i + 1;
    if (page >= total - 3) return total - 6 + i;
    return page - 3 + i;
  });
  return (
    <div className="pagination">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}>이전</button>
      {pages.map((n) => (
        <button key={n} className={page === n ? 'active' : ''} onClick={() => onChange(n)}>{n}</button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page >= total}>다음</button>
    </div>
  );
}
