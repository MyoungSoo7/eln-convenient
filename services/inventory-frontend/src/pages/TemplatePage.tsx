import { useState, useEffect, useCallback } from 'react';
import type { TemplateDoc, Template, TemplateDocFilters, TemplateFilters, NoteStatus } from '../types/template';
import { NOTE_STATUS_LABELS, NOTE_STATUS_COLORS } from '../types/template';
import {
  fetchTemplateDocs,
  deleteTemplateDoc,
  fetchTemplateDocStats,
  fetchTemplates,
  deleteTemplate,
  copyTemplate,
} from '../api/template';
import CreateTemplateModal from '../components/CreateTemplateModal';
import './TemplatePage.css';

type Tab = 'templateDoc' | 'library';
type ModalMode = 'templateDoc' | 'template';
const NOTE_STATUSES = Object.entries(NOTE_STATUS_LABELS) as [NoteStatus, string][];
const CATEGORIES = ['일반', '실험법', '분석법', '품질관리', 'SOP', '안전절차'];

const DEFAULT_DOC_FILTERS: TemplateDocFilters = { q: '', status: '', tag: '', page: 1, limit: 20 };
const DEFAULT_T_FILTERS: TemplateFilters = {
  search: '', category: '', publicOnly: false, sortBy: 'createdAt', page: 1, limit: 20,
};

export default function TemplatePage() {
  const [tab, setTab] = useState<Tab>('templateDoc');

  // ── 템플릿 문서 상태 ──
  const [docs, setDocs]                 = useState<TemplateDoc[]>([]);
  const [docTotal, setDocTotal]         = useState(0);
  const [docLoading, setDocLoading]     = useState(false);
  const [docError, setDocError]         = useState('');
  const [docFilters, setDocFilters]     = useState<TemplateDocFilters>(DEFAULT_DOC_FILTERS);
  const [docSearchInput, setDocSearchInput] = useState('');
  const [stats, setStats]               = useState({ total: 0, draft: 0, in_progress: 0, signed: 0, locked: 0 });
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // ── 템플릿 라이브러리 상태 ──
  const [templates, setTemplates]       = useState<Template[]>([]);
  const [tTotal, setTTotal]             = useState(0);
  const [tLoading, setTLoading]         = useState(false);
  const [tError, setTError]             = useState('');
  const [tFilters, setTFilters]         = useState<TemplateFilters>(DEFAULT_T_FILTERS);
  const [tSearchInput, setTSearchInput] = useState('');
  const [deletingTId, setDeletingTId]   = useState<string | null>(null);
  const [copyingId, setCopyingId]       = useState<string | null>(null);

  // ── 모달 ──
  const [modalMode, setModalMode]       = useState<ModalMode | null>(null);

  // ─── 템플릿 문서 로드 ────────────────────────────────────────
  const loadDocs = useCallback(async () => {
    setDocLoading(true); setDocError('');
    try {
      const res = await fetchTemplateDocs({
        q: docFilters.q || undefined,
        status: docFilters.status || undefined,
        tag: docFilters.tag || undefined,
        page: docFilters.page, limit: docFilters.limit,
      });
      setDocs(res.data); setDocTotal(res.total);
    } catch (e: unknown) {
      setDocError(e instanceof Error ? e.message : '불러오기 실패');
    } finally { setDocLoading(false); }
  }, [docFilters]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  useEffect(() => {
    fetchTemplateDocStats().then(setStats).catch(() => {});
  }, [docs]);

  // ─── 템플릿 라이브러리 로드 ──────────────────────────────────
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
    if (tab === 'library') loadTemplates();
  }, [tab, loadTemplates]);

  // ─── 핸들러 ──────────────────────────────────────────────
  function setDocFilter<K extends keyof TemplateDocFilters>(k: K, v: TemplateDocFilters[K]) {
    setDocFilters((f) => ({ ...f, [k]: v, page: 1 }));
  }
  function setTFilter<K extends keyof TemplateFilters>(k: K, v: TemplateFilters[K]) {
    setTFilters((f) => ({ ...f, [k]: v, page: 1 }));
  }

  async function handleDeleteDoc(p: TemplateDoc) {
    if (!confirm(`"${p.title}" 템플릿을 삭제하시겠습니까?`)) return;
    setDeletingDocId(p.id);
    try { await deleteTemplateDoc(p.id); await loadDocs(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : '삭제 실패'); }
    finally { setDeletingDocId(null); }
  }

  async function handleDeleteTemplate(t: Template) {
    if (!confirm(`"${t.title}" 양식을 삭제하시겠습니까?`)) return;
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

  const docTotalPages = Math.max(1, Math.ceil(docTotal / docFilters.limit));
  const tTotalPages   = Math.max(1, Math.ceil(tTotal / tFilters.limit));
  const docHasFilter  = !!(docFilters.q || docFilters.status || docFilters.tag);
  const tHasFilter    = !!(tFilters.search || tFilters.category || tFilters.publicOnly);

  return (
    <div className="template-page">
      {/* 헤더 */}
      <header className="page-header">
        <div className="page-header-left">
          <h1>템플릿</h1>
          <span className="page-subtitle">실험 템플릿 · SOP · 재사용 양식</span>
        </div>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => { setModalMode('template'); }}>
            + 새 양식
          </button>
          <button className="btn-primary" onClick={() => { setModalMode('templateDoc'); }}>
            + 새 템플릿
          </button>
        </div>
      </header>

      {/* 탭 */}
      <div className="page-tabs">
        <button
          className={`page-tab ${tab === 'templateDoc' ? 'active' : ''}`}
          onClick={() => setTab('templateDoc')}
        >
          내 템플릿
          <span className="tab-badge">{stats.total}</span>
        </button>
        <button
          className={`page-tab ${tab === 'library' ? 'active' : ''}`}
          onClick={() => { setTab('library'); }}
        >
          템플릿 라이브러리
          <span className="tab-badge">{tTotal}</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════
          내 템플릿 탭
          ══════════════════════════════════════════════ */}
      {tab === 'templateDoc' && (
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
                className={`stat-card stat-clickable ${docFilters.status === key ? 'stat-active' : ''}`}
                onClick={() => setDocFilter('status', docFilters.status === key ? '' : key)}
                role="button" tabIndex={0}
              >
                <span className="stat-label">{label}</span>
                <span className="stat-value" style={{ color: NOTE_STATUS_COLORS[key] }}>
                  {stats[key]}
                </span>
              </div>
            ))}
          </div>

          {/* 검색·필터 */}
          <div className="filter-bar">
            <div className="search-group">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder="제목, 내용, 태그 검색..."
                value={docSearchInput}
                onChange={(e) => setDocSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setDocFilter('q', docSearchInput)}
              />
              <button className="btn-search" onClick={() => setDocFilter('q', docSearchInput)}>검색</button>
            </div>
            <div className="filter-selects">
              <select value={docFilters.status} onChange={(e) => setDocFilter('status', e.target.value as NoteStatus | '')}>
                <option value="">모든 상태</option>
                {NOTE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {docHasFilter && (
                <button className="btn-reset" onClick={() => { setDocSearchInput(''); setDocFilters(DEFAULT_DOC_FILTERS); }}>
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 활성 필터 뱃지 */}
          {docHasFilter && (
            <div className="active-filters">
              {docFilters.q && (
                <span className="active-filter">
                  "{docFilters.q}" <button onClick={() => { setDocSearchInput(''); setDocFilter('q', ''); }}>✕</button>
                </span>
              )}
              {docFilters.status && (
                <span className="active-filter">
                  {NOTE_STATUS_LABELS[docFilters.status]} <button onClick={() => setDocFilter('status', '')}>✕</button>
                </span>
              )}
              <span className="filter-count">{docTotal}개 결과</span>
            </div>
          )}

          {docError && <div className="error-bar"><span>{docError}</span><button onClick={loadDocs}>재시도</button></div>}

          {/* 템플릿 문서 목록 */}
          {docLoading ? (
            <div className="list-loading"><span className="spinner" />불러오는 중...</div>
          ) : docs.length === 0 ? (
            <div className="list-empty">
              <div className="list-empty-icon">📋</div>
              <p>{docHasFilter ? '검색 결과가 없습니다.' : '등록된 템플릿이 없습니다.'}</p>
              {!docHasFilter && (
                <button className="btn-primary" onClick={() => setModalMode('templateDoc')}>+ 첫 템플릿 작성</button>
              )}
            </div>
          ) : (
            <div className="doc-list">
              {docs.map((p) => (
                <div key={p.id} className="doc-card">
                  <div className="doc-card-top">
                    <div className="doc-title-row">
                      <h3 className="doc-title">{p.title}</h3>
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
                      <p className="doc-preview">
                        {p.content.slice(0, 130)}{p.content.length > 130 ? '...' : ''}
                      </p>
                    )}
                  </div>
                  <div className="doc-card-footer">
                    <div className="doc-meta">
                      {p.templateId && <span className="meta-badge meta-template">📄 양식 기반</span>}
                      <span className="meta-date">{formatDate(p.createdAt)}</span>
                      {p.tags.length > 0 && (
                        <div className="tag-row">
                          {p.tags.slice(0, 4).map((t) => (
                            <button
                              key={t} className="tag-chip"
                              onClick={() => setDocFilter('tag', docFilters.tag === t ? '' : t)}
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
                      onClick={() => handleDeleteDoc(p)}
                      disabled={deletingDocId === p.id}
                    >
                      {deletingDocId === p.id ? '...' : '삭제'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 페이지네이션 */}
          <Pagination page={docFilters.page} total={docTotalPages} onChange={(n) => setDocFilter('page', n)} />
        </>
      )}

      {/* ══════════════════════════════════════════════
          템플릿 라이브러리 탭
          ══════════════════════════════════════════════ */}
      {tab === 'library' && (
        <>
          {/* 검색·필터 */}
          <div className="filter-bar">
            <div className="search-group">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder="양식 제목, 설명, 태그 검색..."
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

          {/* 양식 목록 */}
          {tLoading ? (
            <div className="list-loading"><span className="spinner" />불러오는 중...</div>
          ) : templates.length === 0 ? (
            <div className="list-empty">
              <div className="list-empty-icon">📂</div>
              <p>{tHasFilter ? '검색 결과가 없습니다.' : '등록된 양식이 없습니다.'}</p>
              {!tHasFilter && (
                <button className="btn-primary" onClick={() => setModalMode('template')}>+ 첫 양식 만들기</button>
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

                  {/* 카운트 통계 */}
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
                    <button
                      className="btn-copy"
                      onClick={() => handleCopyTemplate(t)}
                      disabled={copyingId === t.id}
                      title="이 양식을 복사해 새 양식으로 저장합니다"
                    >
                      {copyingId === t.id ? '복사 중...' : '📋 복사'}
                    </button>
                    <button
                      className="btn-use"
                      onClick={() => {
                        setModalMode('templateDoc');
                      }}
                      title="이 양식으로 새 템플릿 작성"
                    >
                      ➕ 템플릿 작성
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
        <CreateTemplateModal
          defaultMode={modalMode}
          onClose={() => setModalMode(null)}
          onCreated={() => {
            setModalMode(null);
            if (tab === 'templateDoc') loadDocs();
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
