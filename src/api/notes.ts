/**
 * ELN 서비스 API 클라이언트
 * 경로: /api/notes/*, /api/templates/*
 *
 * 상태 전환 규칙:
 *   draft → in_progress (단방향)
 *   in_progress → draft (역방향)
 *   in_progress → signed | locked (단방향)
 *   locked → draft (관리자 잠금 해제 전용)
 */
import apiClient, { type ApiResponse } from './client';
import { mockNotes, mockProtocols, type Note, type Protocol } from '@/lib/mockData';

export interface NoteDetail extends Note {
  sections?: { type: string; title: string; content: string }[];
}

export interface AttachmentRecord {
  id: string;
  noteId: string;
  fileId: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedBy?: string;
  createdAt?: string;
}

export interface NoteLink {
  id: string;
  noteId: string;
  targetType: string;
  targetId: string;
  label?: string | null;
  createdAt?: string;
}

export interface RevisionRecord {
  id: string;
  noteId: string;
  revision: number;
  content: string;
  changedBy: string;
  changeSummary?: string | null;
  createdAt: string;
}

// ── Mock fallback ──
function mockNoteDetail(id: string): NoteDetail {
  const note = mockNotes.find((n) => n.id === id) || mockNotes[0];
  return {
    ...note,
    sections: [
      { type: 'objective', title: '목적', content: note.content?.split('## 재료')[0]?.replace('## 목적\n', '') || '' },
      { type: 'materials', title: '재료', content: '' },
      { type: 'methods', title: '방법', content: '' },
      { type: 'results', title: '결과', content: '' },
      { type: 'discussion', title: '고찰', content: '' },
    ],
  };
}

// ── 노트 API ──
export async function listNotes(params?: { status?: string; tag?: string }): Promise<ApiResponse<Note[]>> {
  try {
    return await apiClient.get<Note[]>('/notes', params as Record<string, string>);
  } catch {
    return { ok: true, data: mockNotes };
  }
}

export async function getNote(id: string): Promise<ApiResponse<NoteDetail>> {
  try {
    return await apiClient.get<NoteDetail>(`/notes/${id}`);
  } catch {
    return { ok: true, data: mockNoteDetail(id) };
  }
}

export async function createNote(data: { title: string; content?: string; templateId?: string; tags?: string[] }): Promise<ApiResponse<{ id: string; [key: string]: unknown }>> {
  try {
    return await apiClient.post<{ id: string }>('/notes', data);
  } catch {
    return { ok: true, data: { id: `note-${Date.now()}` } };
  }
}

export async function updateNote(id: string, data: { title?: string; content?: string; tags?: string[]; changeSummary?: string }): Promise<ApiResponse<Note>> {
  try {
    return await apiClient.put<Note>(`/notes/${id}`, data);
  } catch {
    const note = mockNotes.find((n) => n.id === id) || mockNotes[0];
    return { ok: true, data: { ...note, ...data, updatedAt: new Date().toISOString() } };
  }
}

export async function deleteNote(id: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/notes/${id}`);
  } catch {
    return { ok: true, data: { message: `노트 ${id} 삭제 완료` } };
  }
}

// ── 상태 변경 API ──

/** 노트 상태 전환 */
export async function changeNoteStatus(
  noteId: string,
  status: 'draft' | 'in_progress' | 'signed' | 'locked',
): Promise<ApiResponse<Note>> {
  try {
    return await apiClient.patch<Note>(`/notes/${noteId}/status`, { status });
  } catch {
    const note = mockNotes.find((n) => n.id === noteId) || mockNotes[0];
    return { ok: true, data: { ...note, status, updatedAt: new Date().toISOString() } };
  }
}

/** 관리자 잠금 해제 (locked → draft) */
export async function adminUnlockNote(
  noteId: string,
  adminPassword: string,
  reason?: string,
): Promise<ApiResponse<Note & { auditLog?: unknown }>> {
  try {
    return await apiClient.post<Note & { auditLog?: unknown }>(`/notes/${noteId}/admin-unlock`, {
      adminPassword,
      reason,
    });
  } catch {
    const note = mockNotes.find((n) => n.id === noteId) || mockNotes[0];
    return {
      ok: true,
      data: {
        ...note,
        status: 'draft',
        updatedAt: new Date().toISOString(),
        auditLog: { action: 'admin_unlock', noteId, reason: reason || '관리자 잠금 해제', timestamp: new Date().toISOString() },
      },
    };
  }
}

// ── 리비전 API ──
export async function listRevisions(noteId: string): Promise<ApiResponse<RevisionRecord[]>> {
  try {
    return await apiClient.get<RevisionRecord[]>(`/notes/${noteId}/revisions`);
  } catch {
    const note = mockNotes.find((n) => n.id === noteId);
    return {
      ok: true,
      data: (note?.revisions || []).map((r) => ({
        id: r.id,
        noteId,
        revision: r.version,
        content: '',
        changedBy: r.author,
        changeSummary: r.summary,
        createdAt: r.timestamp,
      })),
    };
  }
}

// ── 첨부파일 API ──
export async function listAttachments(noteId: string): Promise<ApiResponse<AttachmentRecord[]>> {
  try {
    return await apiClient.get<AttachmentRecord[]>(`/notes/${noteId}/attachments`);
  } catch {
    return { ok: true, data: [] };
  }
}

export async function addAttachment(
  noteId: string,
  data: { fileId: string; fileName: string; mimeType?: string; sizeBytes?: number },
): Promise<ApiResponse<AttachmentRecord>> {
  try {
    return await apiClient.post<AttachmentRecord>(`/notes/${noteId}/attachments`, data);
  } catch {
    return {
      ok: true,
      data: {
        id: `att-${Date.now()}`,
        noteId,
        fileId: data.fileId,
        fileName: data.fileName,
        mimeType: data.mimeType || null,
        sizeBytes: data.sizeBytes || null,
        uploadedBy: 'me',
        createdAt: new Date().toISOString(),
      },
    };
  }
}

export async function deleteAttachmentRecord(noteId: string, attachmentId: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/notes/${noteId}/attachments/${attachmentId}`);
  } catch {
    return { ok: true, data: { message: '삭제 완료' } };
  }
}

// ── 링크 API ──
export async function getLinks(noteId: string): Promise<ApiResponse<NoteLink[]>> {
  try {
    return await apiClient.get<NoteLink[]>(`/notes/${noteId}/links`);
  } catch {
    const note = mockNotes.find((n) => n.id === noteId);
    return {
      ok: true,
      data: (note?.linkedItems || []).map((item) => ({
        id: item.id,
        noteId,
        targetType: item.type,
        targetId: item.id,
        label: item.name,
      })),
    };
  }
}

export async function createNoteLink(
  noteId: string,
  data: { targetType: string; targetId: string; label?: string },
): Promise<ApiResponse<NoteLink>> {
  try {
    return await apiClient.post<NoteLink>(`/notes/${noteId}/links`, data);
  } catch {
    return {
      ok: true,
      data: { id: `link-${Date.now()}`, noteId, targetType: data.targetType, targetId: data.targetId, label: data.label || null },
    };
  }
}

export async function deleteNoteLink(noteId: string, linkId: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/notes/${noteId}/links/${linkId}`);
  } catch {
    return { ok: true, data: { message: '삭제 완료' } };
  }
}

// ── 템플릿 API ──
export interface TemplateRecord {
  id: string;
  title: string;
  description?: string;
  content?: string;
  category: string;
  sections?: unknown[];
  tags: string[];
  createdBy?: string;
  isPublic?: boolean;
  useCount: number;
  copyCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export async function listTemplates(params?: { category?: string; page?: number; limit?: number }): Promise<ApiResponse<TemplateRecord[]>> {
  try {
    const q: Record<string, string> = {};
    if (params?.category) q.category = params.category;
    if (params?.page != null) q.page = String(params.page);
    if (params?.limit != null) q.limit = String(params.limit);
    const res = await apiClient.get<{ data: TemplateRecord[] }>('/templates', Object.keys(q).length ? q : undefined);
    const data = (res as { data?: TemplateRecord[] }).data;
    return { ok: true, data: Array.isArray(data) ? data : [] };
  } catch {
    return { ok: true, data: mockProtocols.map((p) => ({ id: p.id, title: p.title, category: p.category, tags: p.tags, useCount: p.usageCount ?? 0 })) };
  }
}

export async function getTemplate(id: string): Promise<ApiResponse<TemplateRecord>> {
  try {
    const res = await apiClient.get<TemplateRecord>(`/templates/${id}`);
    return res;
  } catch {
    const p = mockProtocols.find((x) => x.id === id) || mockProtocols[0];
    return { ok: true, data: { id: p.id, title: p.title, category: p.category, tags: p.tags, useCount: p.usageCount ?? 0 } };
  }
}

export async function createTemplate(data: {
  title: string;
  description?: string;
  content?: string;
  category?: string;
  sections?: unknown[];
  tags?: string[];
  isPublic?: boolean;
}): Promise<ApiResponse<TemplateRecord>> {
  try {
    const res = await apiClient.post<TemplateRecord>('/templates', data);
    return res;
  } catch {
    return {
      ok: true,
      data: {
        id: `tmpl-${Date.now()}`,
        title: data.title,
        description: data.description ?? '',
        category: data.category ?? '일반',
        tags: data.tags ?? [],
        useCount: 0,
      },
    };
  }
}

export async function copyTemplate(templateId: string): Promise<ApiResponse<TemplateRecord>> {
  try {
    const res = await apiClient.post<TemplateRecord>(`/templates/${templateId}/copy`, {});
    return res;
  } catch {
    const p = mockProtocols.find((x) => x.id === templateId) || mockProtocols[0];
    return {
      ok: true,
      data: {
        id: `tmpl-copy-${Date.now()}`,
        title: `${p.title} (복사본)`,
        category: p.category,
        tags: p.tags,
        useCount: 0,
      },
    };
  }
}
