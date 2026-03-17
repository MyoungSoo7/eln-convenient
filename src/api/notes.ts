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
import { type Note } from '@/lib/mockData';

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

const ERR_CONN = '서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.';

// ── 노트 API ──
export async function listNotes(params?: { status?: string; tag?: string }): Promise<ApiResponse<Note[]>> {
  try {
    const res = await apiClient.get<{ data?: Note[] } | Note[]>('/notes', params as Record<string, string>);
    if (!res.ok) return { ok: false, data: [], error: res.error };
    // 백엔드가 { ok, data: [...], total, page } 형태로 반환
    const raw = res.data as { data?: Note[] } | Note[];
    const notes = Array.isArray(raw) ? raw : (Array.isArray((raw as { data?: Note[] }).data) ? (raw as { data?: Note[] }).data! : []);
    return { ok: true, data: notes };
  } catch (err) {
    return { ok: false, data: [], error: (err as Error).message || ERR_CONN };
  }
}

export async function getNote(id: string): Promise<ApiResponse<NoteDetail>> {
  try {
    return await apiClient.get<NoteDetail>(`/notes/${id}`);
  } catch (err) {
    return { ok: false, data: null as unknown as NoteDetail, error: (err as Error).message || ERR_CONN };
  }
}

export async function createNote(data: {
  title: string;
  content?: string;
  templateId?: string;
  tags?: string[];
}): Promise<ApiResponse<{ id: string; [key: string]: unknown }>> {
  try {
    return await apiClient.post<{ id: string }>('/notes', data);
  } catch (err) {
    return { ok: false, data: null as unknown as { id: string }, error: (err as Error).message || ERR_CONN };
  }
}

export async function updateNote(
  id: string,
  data: { title?: string; content?: string; tags?: string[]; changeSummary?: string },
): Promise<ApiResponse<Note>> {
  try {
    return await apiClient.put<Note>(`/notes/${id}`, data);
  } catch (err) {
    return { ok: false, data: null as unknown as Note, error: (err as Error).message || ERR_CONN };
  }
}

export async function deleteNote(id: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/notes/${id}`);
  } catch (err) {
    return { ok: false, data: { message: '' }, error: (err as Error).message || ERR_CONN };
  }
}

// ── 상태 변경 API ──

export async function changeNoteStatus(
  noteId: string,
  status: 'draft' | 'in_progress' | 'signed' | 'locked',
): Promise<ApiResponse<Note>> {
  try {
    return await apiClient.patch<Note>(`/notes/${noteId}/status`, { status });
  } catch (err) {
    return { ok: false, data: null as unknown as Note, error: (err as Error).message || ERR_CONN };
  }
}

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
  } catch (err) {
    return { ok: false, data: null as unknown as Note, error: (err as Error).message || ERR_CONN };
  }
}

// ── 리비전 API ──
export async function listRevisions(noteId: string): Promise<ApiResponse<RevisionRecord[]>> {
  try {
    return await apiClient.get<RevisionRecord[]>(`/notes/${noteId}/revisions`);
  } catch (err) {
    return { ok: false, data: [], error: (err as Error).message || ERR_CONN };
  }
}

// ── 첨부파일 API ──
export async function listAttachments(noteId: string): Promise<ApiResponse<AttachmentRecord[]>> {
  try {
    return await apiClient.get<AttachmentRecord[]>(`/notes/${noteId}/attachments`);
  } catch (err) {
    return { ok: false, data: [], error: (err as Error).message || ERR_CONN };
  }
}

export async function addAttachment(
  noteId: string,
  data: { fileId: string; fileName: string; mimeType?: string; sizeBytes?: number },
): Promise<ApiResponse<AttachmentRecord>> {
  try {
    return await apiClient.post<AttachmentRecord>(`/notes/${noteId}/attachments`, data);
  } catch (err) {
    return { ok: false, data: null as unknown as AttachmentRecord, error: (err as Error).message || ERR_CONN };
  }
}

export async function deleteAttachmentRecord(
  noteId: string,
  attachmentId: string,
): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/notes/${noteId}/attachments/${attachmentId}`);
  } catch (err) {
    return { ok: false, data: { message: '' }, error: (err as Error).message || ERR_CONN };
  }
}

// ── 링크 API ──
export async function getLinks(noteId: string): Promise<ApiResponse<NoteLink[]>> {
  try {
    return await apiClient.get<NoteLink[]>(`/notes/${noteId}/links`);
  } catch (err) {
    return { ok: false, data: [], error: (err as Error).message || ERR_CONN };
  }
}

export async function createNoteLink(
  noteId: string,
  data: { targetType: string; targetId: string; label?: string },
): Promise<ApiResponse<NoteLink>> {
  try {
    return await apiClient.post<NoteLink>(`/notes/${noteId}/links`, data);
  } catch (err) {
    return { ok: false, data: null as unknown as NoteLink, error: (err as Error).message || ERR_CONN };
  }
}

export async function deleteNoteLink(noteId: string, linkId: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/notes/${noteId}/links/${linkId}`);
  } catch (err) {
    return { ok: false, data: { message: '' }, error: (err as Error).message || ERR_CONN };
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

export async function listTemplates(params?: {
  category?: string;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<TemplateRecord[]>> {
  try {
    const q: Record<string, string> = {};
    if (params?.category) q.category = params.category;
    if (params?.page != null) q.page = String(params.page);
    if (params?.limit != null) q.limit = String(params.limit);
    const res = await apiClient.get<{ data: TemplateRecord[] }>(
      '/templates',
      Object.keys(q).length ? q : undefined,
    );
    if (!res.ok) return { ok: false, data: [], error: res.error };
    const data = (res as unknown as { data?: TemplateRecord[] }).data;
    return { ok: true, data: Array.isArray(data) ? data : [] };
  } catch (err) {
    return { ok: false, data: [], error: (err as Error).message || ERR_CONN };
  }
}

export async function getTemplate(id: string): Promise<ApiResponse<TemplateRecord>> {
  try {
    return await apiClient.get<TemplateRecord>(`/templates/${id}`);
  } catch (err) {
    return { ok: false, data: null as unknown as TemplateRecord, error: (err as Error).message || ERR_CONN };
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
    return await apiClient.post<TemplateRecord>('/templates', data);
  } catch (err) {
    return { ok: false, data: null as unknown as TemplateRecord, error: (err as Error).message || ERR_CONN };
  }
}

export async function copyTemplate(templateId: string): Promise<ApiResponse<TemplateRecord>> {
  try {
    return await apiClient.post<TemplateRecord>(`/templates/${templateId}/copy`, {});
  } catch (err) {
    return { ok: false, data: null as unknown as TemplateRecord, error: (err as Error).message || ERR_CONN };
  }
}
