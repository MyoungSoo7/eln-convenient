/**
 * ELN 서비스 API 클라이언트
 * 경로: /api/notes/*, /api/templates/*
 */
import apiClient, { type ApiResponse } from './client';
import { mockNotes, mockProtocols, type Note, type Protocol, type Revision, type LinkedItem } from '@/lib/mockData';

export interface NoteDetail extends Note {
  sections?: { type: string; title: string; content: string }[];
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

export async function createNote(data: { title: string; templateId?: string; tags?: string[] }): Promise<ApiResponse<{ id: string }>> {
  try {
    return await apiClient.post<{ id: string }>('/notes', data);
  } catch {
    return { ok: true, data: { id: `note-${Date.now()}` } };
  }
}

export async function updateNote(id: string, data: Partial<Note>): Promise<ApiResponse<Note>> {
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

export async function listRevisions(noteId: string): Promise<ApiResponse<Revision[]>> {
  try {
    return await apiClient.get<Revision[]>(`/notes/${noteId}/revisions`);
  } catch {
    const note = mockNotes.find((n) => n.id === noteId);
    return { ok: true, data: note?.revisions || [] };
  }
}

export async function getLinks(noteId: string): Promise<ApiResponse<LinkedItem[]>> {
  try {
    return await apiClient.get<LinkedItem[]>(`/notes/${noteId}/links`);
  } catch {
    const note = mockNotes.find((n) => n.id === noteId);
    return { ok: true, data: note?.linkedItems || [] };
  }
}

export async function addAttachment(noteId: string, file: File): Promise<ApiResponse<{ fileId: string }>> {
  try {
    return await apiClient.post<{ fileId: string }>(`/notes/${noteId}/attachments`, { filename: file.name });
  } catch {
    return { ok: true, data: { fileId: `file-${Date.now()}` } };
  }
}

// ── 템플릿 API ──
export async function listTemplates(): Promise<ApiResponse<Protocol[]>> {
  try {
    return await apiClient.get<Protocol[]>('/templates');
  } catch {
    return { ok: true, data: mockProtocols };
  }
}

export async function getTemplate(id: string): Promise<ApiResponse<Protocol>> {
  try {
    return await apiClient.get<Protocol>(`/templates/${id}`);
  } catch {
    return { ok: true, data: mockProtocols.find((p) => p.id === id) || mockProtocols[0] };
  }
}
