/**
 * 파일 서비스 API 클라이언트
 * 경로: /api/files/*
 */
import { getToken, clearToken } from '@/lib/authToken';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

export interface UploadedFile {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  createdAt: string;
}

export interface FileMetadata {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

/** POST /api/files — multipart/form-data 업로드 */
export async function uploadFile(
  file: File,
  linkedEntity?: { type: string; id: string },
): Promise<ApiResponse<UploadedFile>> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    if (linkedEntity) {
      formData.append('linkedEntityType', linkedEntity.type);
      formData.append('linkedEntityId', linkedEntity.id);
    }
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/files`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    if (response.status === 401) {
      clearToken();
      window.location.href = '/login';
      throw new Error('401');
    }
    return await response.json();
  } catch (err) {
    return { ok: false, data: null as unknown as UploadedFile, error: (err as Error).message || '파일 업로드에 실패했습니다.' };
  }
}

export async function getFile(id: string): Promise<ApiResponse<FileMetadata>> {
  try {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/files/${id}/meta`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return await response.json();
  } catch (err) {
    return { ok: false, data: null as unknown as FileMetadata, error: (err as Error).message || '파일 조회에 실패했습니다.' };
  }
}

export async function deleteFile(id: string): Promise<ApiResponse<{ message: string }>> {
  try {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/files/${id}`, {
      method: 'DELETE',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return await response.json();
  } catch (err) {
    return { ok: false, data: { message: '' }, error: (err as Error).message || '파일 삭제에 실패했습니다.' };
  }
}

/** GET /api/files/:id/url — presigned 다운로드 URL */
export function getFileDownloadUrl(fileId: string): string {
  return `${API_BASE_URL}/files/${fileId}`;
}
