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

/** POST /api/files — multipart/form-data 업로드 (XHR for progress tracking) */
export async function uploadFile(
  file: File,
  linkedEntity?: { type: string; id: string },
  onProgress?: (percent: number) => void,
): Promise<ApiResponse<UploadedFile>> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append('file', file);
    if (linkedEntity) {
      formData.append('linkedEntityType', linkedEntity.type);
      formData.append('linkedEntityId', linkedEntity.id);
    }
    const token = getToken();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/files`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status === 401) {
        clearToken();
        window.location.href = '/login';
        resolve({ ok: false, data: null as unknown as UploadedFile, error: '401' });
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ ok: false, data: null as unknown as UploadedFile, error: 'Invalid response' });
      }
    };

    xhr.onerror = () => {
      resolve({ ok: false, data: null as unknown as UploadedFile, error: 'Network error' });
    };

    xhr.send(formData);
  });
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
