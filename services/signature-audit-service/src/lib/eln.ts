// services/signature-audit-service/src/lib/eln.ts

const ELN_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002';
const TIMEOUT_MS = 5000;

export class ElnServiceError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ElnServiceError';
  }
}

export interface NoteData {
  id: string;
  title: string;
  status: string;
  authorId: string;
  teamId?: string | null;
  updatedAt: string;
  type: string;
}

export interface NoteListResponse {
  ok: boolean;
  data: NoteData[];
  total: number;
  page: number;
}

/** 내부 시스템 호출용 공통 헤더 */
function internalHeaders(orgId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'x-user-id': 'system',
    'x-user-role': 'admin',
    'x-user-permissions': JSON.stringify(['*']),
  };
  if (orgId) headers['x-user-org-id'] = orgId;
  return headers;
}

/** fetch with timeout */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ElnServiceError('eln-service 타임아웃');
    }
    throw new ElnServiceError(`eln-service 연결 실패: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/notes?type=note&status=X&limit=1 → total 카운트만 반환 */
export async function fetchNoteCount(status: string, orgId?: string): Promise<number> {
  const url = `${ELN_URL}/api/notes?type=note&status=${status}&limit=1`;
  const res = await fetchWithTimeout(url, { headers: internalHeaders(orgId) });
  if (!res.ok) throw new ElnServiceError(`eln-service 오류: ${res.status}`);
  const body = await res.json() as NoteListResponse;
  return body.total ?? 0;
}

/** GET /api/notes with arbitrary query params */
export async function fetchNotes(params: Record<string, string>, orgId?: string): Promise<NoteListResponse> {
  const qs = new URLSearchParams(params).toString();
  const url = `${ELN_URL}/api/notes?${qs}`;
  const res = await fetchWithTimeout(url, { headers: internalHeaders(orgId) });
  if (!res.ok) throw new ElnServiceError(`eln-service 오류: ${res.status}`);
  return res.json() as Promise<NoteListResponse>;
}

/** GET /api/notes/:id → NoteData 또는 null(404) */
export async function fetchNote(noteId: string, orgId?: string): Promise<NoteData | null> {
  const url = `${ELN_URL}/api/notes/${noteId}`;
  const res = await fetchWithTimeout(url, { headers: internalHeaders(orgId) });
  if (res.status === 404) return null;
  if (!res.ok) throw new ElnServiceError(`eln-service 오류: ${res.status}`);
  const body = await res.json() as { ok: boolean; data: NoteData };
  return body.data;
}
