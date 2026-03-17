import { useState, useEffect } from 'react';
import type { CreateProtocolDto, CreateTemplateDto, Template } from '../types/protocol';
import { createProtocol, createTemplate, fetchTemplates } from '../api/protocol';
import './CreateProtocolModal.css';

type Mode = 'protocol' | 'template';

interface Props {
  onClose: () => void;
  onCreated: () => void;
  defaultMode?: Mode;
}

const CATEGORIES = ['실험법', '분석법', '품질관리', 'SOP', '안전절차', '기타'];

export default function CreateProtocolModal({ onClose, onCreated, defaultMode = 'protocol' }: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode);

  // ── 공통 폼 필드 ──
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── 프로토콜 전용 ──
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  // ── 템플릿 전용 ──
  const [category, setCategory] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    if (mode === 'protocol') {
      setTemplatesLoading(true);
      fetchTemplates({ publicOnly: false })
        .then((res) => setTemplates(res.data))
        .catch(() => {/* 템플릿 로드 실패 무시 */})
        .finally(() => setTemplatesLoading(false));
    }
  }, [mode]);

  // 템플릿 선택 시 내용 자동 채우기
  function selectTemplate(tpl: Template) {
    setTemplateId(tpl.id);
    if (!content) setContent(tpl.content ?? '');
    if (tags.length === 0 && tpl.tags.length > 0) setTags(tpl.tags);
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || tags.includes(tag)) return;
    setTags((prev) => [...prev, tag]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('제목은 필수입니다.'); return; }

    setLoading(true);
    try {
      if (mode === 'protocol') {
        const dto: CreateProtocolDto = {
          title: title.trim(),
          type: 'protocol',
          content: content || undefined,
          ...(templateId && { templateId }),
          tags,
        };
        await createProtocol(dto);
      } else {
        const dto: CreateTemplateDto = {
          title: title.trim(),
          content: content || undefined,
          ...(category && { category }),
          isPublic,
          tags,
        };
        await createTemplate(dto);
      }
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const filteredTemplates = templates.filter((t) =>
    !templateSearch || t.title.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cp-modal">
        {/* 헤더 */}
        <div className="cp-modal-header">
          <div className="cp-mode-tabs">
            <button
              className={`cp-tab ${mode === 'protocol' ? 'active' : ''}`}
              onClick={() => setMode('protocol')}
              type="button"
            >
              새 프로토콜
            </button>
            <button
              className={`cp-tab ${mode === 'template' ? 'active' : ''}`}
              onClick={() => setMode('template')}
              type="button"
            >
              새 템플릿
            </button>
          </div>
          <button className="cp-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <form className="cp-form" onSubmit={handleSubmit}>
          {/* 좌측: 폼 입력 */}
          <div className="cp-left">
            {/* 제목 */}
            <div className="cp-field">
              <label className="cp-label required">
                {mode === 'protocol' ? '프로토콜 제목' : '템플릿 제목'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={mode === 'protocol' ? '예: PCR 증폭 프로토콜 v2' : '예: 기본 실험 절차'}
                className="cp-input"
                required
              />
            </div>

            {/* 템플릿 전용: 카테고리 & 공개 여부 */}
            {mode === 'template' && (
              <div className="cp-row">
                <div className="cp-field">
                  <label className="cp-label">카테고리</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="cp-input"
                  >
                    <option value="">카테고리 선택</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="cp-field cp-field-center">
                  <label className="cp-label">공개 여부</label>
                  <label className="cp-toggle">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                    />
                    <span className="cp-toggle-track" />
                    <span className="cp-toggle-label">{isPublic ? '공개' : '비공개'}</span>
                  </label>
                </div>
              </div>
            )}

            {/* 내용 */}
            <div className="cp-field cp-field-grow">
              <label className="cp-label">내용</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  mode === 'protocol'
                    ? '프로토콜 내용을 입력하세요.\n\n1. 준비물\n2. 실험 절차\n3. 주의사항'
                    : '재사용 가능한 템플릿 내용을 입력하세요.'
                }
                className="cp-textarea"
                rows={10}
              />
            </div>

            {/* 태그 */}
            <div className="cp-field">
              <label className="cp-label">태그</label>
              <div className="cp-tag-row">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="태그 입력 후 Enter"
                  className="cp-input"
                />
                <button type="button" className="cp-btn-tag" onClick={addTag}>추가</button>
              </div>
              {tags.length > 0 && (
                <div className="cp-tags">
                  {tags.map((tag) => (
                    <span key={tag} className="cp-tag">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="cp-error">{error}</p>}
          </div>

          {/* 우측: 템플릿 선택 패널 (프로토콜 모드에서만) */}
          {mode === 'protocol' && (
            <div className="cp-right">
              <div className="cp-tpl-header">
                <span className="cp-tpl-title">템플릿으로 시작</span>
                <span className="cp-tpl-sub">선택하면 내용이 자동으로 채워집니다</span>
              </div>
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="템플릿 검색..."
                className="cp-tpl-search"
              />
              <div className="cp-tpl-list">
                <button
                  type="button"
                  className={`cp-tpl-item ${templateId === '' ? 'selected' : ''}`}
                  onClick={() => { setTemplateId(''); }}
                >
                  <span className="cp-tpl-name">템플릿 없이 시작</span>
                  <span className="cp-tpl-desc">빈 프로토콜로 시작합니다</span>
                </button>

                {templatesLoading ? (
                  <div className="cp-tpl-loading">템플릿 불러오는 중...</div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="cp-tpl-empty">
                    {templateSearch ? '검색 결과 없음' : '등록된 템플릿이 없습니다'}
                  </div>
                ) : (
                  filteredTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`cp-tpl-item ${templateId === tpl.id ? 'selected' : ''}`}
                      onClick={() => selectTemplate(tpl)}
                    >
                      <div className="cp-tpl-item-top">
                        <span className="cp-tpl-name">{tpl.title}</span>
                        {tpl.category && (
                          <span className="cp-tpl-badge">{tpl.category}</span>
                        )}
                      </div>
                      {tpl.description && (
                        <span className="cp-tpl-desc">{tpl.description}</span>
                      )}
                      {tpl.tags.length > 0 && (
                        <div className="cp-tpl-tags">
                          {tpl.tags.slice(0, 3).map((t) => (
                            <span key={t} className="cp-tpl-tag">{t}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 푸터 */}
          <div className="cp-footer">
            <button type="button" className="cp-btn cp-btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="cp-btn cp-btn-primary" disabled={loading}>
              {loading ? '저장 중...' : mode === 'protocol' ? '프로토콜 생성' : '템플릿 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
