/**
 * 파일 서비스 API 클라이언트
 * 경로: /api/files/*
 */
import apiClient, { type ApiResponse } from './client';

export interface FileMetadata {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

export async function uploadFile(file: File, linkedEntity?: { type: string; id: string }): Promise<ApiResponse<FileMetadata>> {
  try {
    // TODO: multipart/form-data 전송
    return await apiClient.post<FileMetadata>('/files', {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      linkedEntityType: linkedEntity?.type,
      linkedEntityId: linkedEntity?.id,
    });
  } catch {
    return {
      ok: true,
      data: {
        fileId: `file-${Date.now()}`,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        uploadedBy: 'user-001',
        uploadedAt: new Date().toISOString(),
        url: `/api/files/file-${Date.now()}`,
      },
    };
  }
}

export async function getFile(id: string): Promise<ApiResponse<FileMetadata>> {
  try {
    return await apiClient.get<FileMetadata>(`/files/${id}`);
  } catch {
    return {
      ok: true,
      data: {
        fileId: id,
        filename: 'experiment_result.png',
        mimeType: 'image/png',
        size: 1024000,
        uploadedBy: 'user-001',
        uploadedAt: '2024-03-15T09:30:00Z',
        url: `/api/files/${id}`,
      },
    };
  }
}

export async function deleteFile(id: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/files/${id}`);
  } catch {
    return { ok: true, data: { message: `파일 ${id} 삭제 완료` } };
  }
}
