/**
 * 전자서명/감사로그 서비스 API 클라이언트
 * 경로: /api/signatures/*, /api/audit/*, /api/export/*
 */
import apiClient, { type ApiResponse } from './client';
import { mockAuditLog, type AuditEntry } from '@/lib/mockData';

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
  valid: boolean;
  verifiedAt: string;
  message: string;
}

export interface ExportJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
}

// ── 서명 API ──
export async function signNote(noteId: string, password: string): Promise<ApiResponse<SignatureResult>> {
  try {
    return await apiClient.post<SignatureResult>(`/signatures/sign/${noteId}`, { password });
  } catch {
    return {
      ok: true,
      data: {
        signatureId: `sig-${Date.now()}`,
        noteId,
        signedBy: 'user-001',
        signedAt: new Date().toISOString(),
        hash: 'sha256:mock-hash',
        status: 'signed',
      },
    };
  }
}

export async function verifySignature(noteId: string): Promise<ApiResponse<VerifyResult>> {
  try {
    return await apiClient.get<VerifyResult>(`/signatures/verify/${noteId}`);
  } catch {
    return {
      ok: true,
      data: { noteId, valid: true, verifiedAt: new Date().toISOString(), message: '서명이 유효합니다.' },
    };
  }
}

// ── 감사로그 API ──
export async function listAuditLogs(params?: { entityId?: string; type?: string }): Promise<ApiResponse<AuditEntry[]>> {
  try {
    return await apiClient.get<AuditEntry[]>('/audit', params as Record<string, string>);
  } catch {
    let logs = mockAuditLog;
    if (params?.entityId) logs = logs.filter((l) => l.entityId === params.entityId);
    if (params?.type) logs = logs.filter((l) => l.entityType === params.type);
    return { ok: true, data: logs };
  }
}

// ── 내보내기 API ──
export async function exportPdf(noteId: string): Promise<ApiResponse<ExportJob>> {
  try {
    return await apiClient.post<ExportJob>(`/export/pdf/${noteId}`);
  } catch {
    return { ok: true, data: { jobId: `job-pdf-${Date.now()}`, status: 'queued' } };
  }
}

export async function exportZip(noteIds: string[]): Promise<ApiResponse<ExportJob>> {
  try {
    return await apiClient.post<ExportJob>('/export/zip', { noteIds });
  } catch {
    return { ok: true, data: { jobId: `job-zip-${Date.now()}`, status: 'queued' } };
  }
}

export async function getExportStatus(jobId: string): Promise<ApiResponse<ExportJob>> {
  try {
    return await apiClient.get<ExportJob>(`/export/status/${jobId}`);
  } catch {
    return { ok: true, data: { jobId, status: 'completed', downloadUrl: `/api/files/export-${jobId}.pdf` } };
  }
}
