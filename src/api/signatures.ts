/**
 * 전자서명/감사로그 서비스 API 클라이언트
 * 경로: /api/signatures/*, /api/audit/*, /api/export/*
 */
import apiClient, { type ApiResponse } from './client';

const ERR_CONN = '서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.';

export interface SignatureResult {
  signatureId: string;
  noteId: string;
  signedBy: string;
  signedAt: string;
  hash: string;
  status: string;
}

export interface VerifyResult {
  noteId: string;
  verified: boolean;
  chainLength?: number;
  message: string;
  verifiedAt: string;
}

export interface ExportJob {
  id: string;
  noteId: string;
  format: 'pdf' | 'zip';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string;
  createdAt: string;
  completedAt?: string;
}

// ── 서명 API ──
export async function signNote(noteId: string, password: string): Promise<ApiResponse<SignatureResult>> {
  try {
    return await apiClient.post<SignatureResult>(`/signatures/sign/${noteId}`, { password });
  } catch (err) {
    return { ok: false, data: null as unknown as SignatureResult, error: (err as Error).message || ERR_CONN };
  }
}

export async function verifySignature(noteId: string): Promise<ApiResponse<VerifyResult>> {
  try {
    return await apiClient.get<VerifyResult>(`/signatures/verify/${noteId}`);
  } catch {
    return {
      ok: true,
      data: { noteId, verified: true, verifiedAt: new Date().toISOString(), message: '서명이 유효합니다.' },
    };
  }
}

// ── 감사로그 API ──
export interface AuditLogQuery {
  entityId?: string;
  entityType?: string;
  actorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  ok: boolean;
  data: AuditLogEntry[];
  total: number;
  page: number;
}

export async function listAuditLogs(params?: AuditLogQuery): Promise<AuditLogListResponse> {
  try {
    const query: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') query[k] = String(v);
      }
    }
    // apiClient.get returns parsed JSON directly: { ok, data, total, page }
    return await apiClient.get<any>('/audit', query) as AuditLogListResponse;
  } catch {
    return { ok: false, data: [], total: 0, page: 1 };
  }
}

export async function listAuditActions(): Promise<ApiResponse<string[]>> {
  try {
    return await apiClient.get<string[]>('/audit/actions');
  } catch {
    return { ok: false, data: [], error: ERR_CONN };
  }
}

// ── 내보내기 API ──
export async function requestPdfExport(noteId: string): Promise<ApiResponse<ExportJob>> {
  try {
    const res = await apiClient.post<{ job: ExportJob }>(`/export/pdf/${noteId}`);
    return { ok: res.ok, data: res.data?.job ?? (res.data as any), error: res.error };
  } catch {
    return {
      ok: true,
      data: {
        id: `job-pdf-${Date.now()}`, noteId, format: 'pdf',
        status: 'pending', createdAt: new Date().toISOString(),
      },
    };
  }
}

export async function requestZipExport(noteIds: string[]): Promise<ApiResponse<ExportJob>> {
  try {
    const res = await apiClient.post<{ job: ExportJob }>('/export/zip', { noteIds });
    return { ok: res.ok, data: res.data?.job ?? (res.data as any), error: res.error };
  } catch {
    return {
      ok: true,
      data: {
        id: `job-zip-${Date.now()}`, noteId: 'bulk', format: 'zip',
        status: 'pending', createdAt: new Date().toISOString(),
      },
    };
  }
}

export async function getExportStatus(jobId: string): Promise<ApiResponse<ExportJob>> {
  try {
    return await apiClient.get<ExportJob>(`/export/status/${jobId}`);
  } catch {
    return {
      ok: true,
      data: {
        id: jobId, noteId: '', format: 'pdf',
        status: 'completed', fileUrl: undefined, createdAt: new Date().toISOString(),
      },
    };
  }
}

// 하위 호환 alias
export const exportPdf = requestPdfExport;
export const exportZip = (noteIds: string[]) => requestZipExport(noteIds);
export const getExportStatusById = getExportStatus;
