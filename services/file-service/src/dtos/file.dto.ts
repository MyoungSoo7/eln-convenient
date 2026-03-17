export type LinkedEntityType = 'note' | 'protocol' | 'inventory';

export interface UploadFileDto {
  linkedEntityType?: LinkedEntityType;
  linkedEntityId?: string;
}

export interface PresignedUploadRequestDto {
  filename: string;         // 원본 파일명 (확장자 포함)
  contentType: string;      // MIME 타입
  linkedEntityType?: LinkedEntityType;
  linkedEntityId?: string;
}

export interface PresignedUploadResponseDto {
  fileId: string;
  key: string;
  uploadUrl: string;        // presigned PUT URL (15분 유효)
  expiresAt: string;
}
