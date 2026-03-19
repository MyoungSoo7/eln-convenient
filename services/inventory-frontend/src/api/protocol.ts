import type {
  Protocol,
  Template,
  CreateProtocolDto,
  CreateTemplateDto,
  NoteStatus,
} from '../types/protocol';

const BASE = import.meta.env.VITE_API_URL ?? '';

const DEV_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'x-user-id': 'dev-user',
  'x-user-permissions': JSON.stringify(['*']),
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...DEV_HEADERS, ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

// ── (1)(2) 프로토콜 CRUD ─────────────────────────────────────

export interface ProtocolsResponse {
  ok: boolean;
  data: Protocol[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchProtocols(params: {
  q?: string;
  status?: NoteStatus | '';
  tag?: string;
  page?: number;
  limit?: number;
}): Promise<ProtocolsResponse> {
  const qs = new URLSearchParams();
  if (params.q)      qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.tag)    qs.set('tag', params.tag);
  qs.set('page',  String(params.page  ?? 1));
  qs.set('limit', String(params.limit ?? 20));
  return request<ProtocolsResponse>(`/api/protocols?${qs}`);
}

export async function createProtocol(
  dto: CreateProtocolDto,
): Promise<{ ok: boolean; data: Protocol }> {
  return request(`/api/protocols`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function deleteProtocol(id: string): Promise<void> {
  await request(`/api/protocols/${id}`, { method: 'DELETE' });
}

export async function fetchProtocolStats(): Promise<{
  total: number;
  draft: number;
  in_progress: number;
  signed: number;
  locked: number;
}> {
  const [all, draft, inProg, signed, locked] = await Promise.all([
    request<ProtocolsResponse>('/api/protocols?limit=1&page=1'),
    request<ProtocolsResponse>('/api/protocols?limit=1&page=1&status=draft'),
    request<ProtocolsResponse>('/api/protocols?limit=1&page=1&status=in_progress'),
    request<ProtocolsResponse>('/api/protocols?limit=1&page=1&status=signed'),
    request<ProtocolsResponse>('/api/protocols?limit=1&page=1&status=locked'),
  ]);
  return { total: all.total, draft: draft.total, in_progress: inProg.total, signed: signed.total, locked: locked.total };
}

// ── (1)(2)(3)(4) 템플릿 CRUD + 복사 ─────────────────────────

export interface TemplatesResponse {
  ok: boolean;
  data: Template[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchTemplates(params?: {
  search?: string;
  category?: string;
  publicOnly?: boolean;
  sortBy?: string;
  page?: number;
  limit?: number;
}): Promise<TemplatesResponse> {
  const qs = new URLSearchParams();
  if (params?.search)     qs.set('search', params.search);
  if (params?.category)   qs.set('category', params.category);
  if (params?.publicOnly) qs.set('publicOnly', 'true');
  if (params?.sortBy)     qs.set('sortBy', params.sortBy);
  qs.set('page',  String(params?.page  ?? 1));
  qs.set('limit', String(params?.limit ?? 20));
  return request<TemplatesResponse>(`/api/templates?${qs}`);
}

export async function createTemplate(
  dto: CreateTemplateDto,
): Promise<{ ok: boolean; data: Template }> {
  return request(`/api/templates`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await request(`/api/templates/${id}`, { method: 'DELETE' });
}

// (3) 템플릿 복사 — POST /api/templates/:id/copy
export async function copyTemplate(
  id: string,
): Promise<{ ok: boolean; data: Template; originalId: string }> {
  return request(`/api/templates/${id}/copy`, { method: 'POST' });
}

// 검색 모달용 경량 조회 (공개 템플릿만)
export async function fetchPublicTemplates(search?: string): Promise<Template[]> {
  const res = await fetchTemplates({ search, publicOnly: false, limit: 50 });
  return res.data;
}
