export interface SignRequestDto {
  noteId: string;
  password: string;  // TODO: 실제 인증 시 사용
  comment?: string;
}

export interface ExportPdfDto {
  noteId: string;
  includeAttachments?: boolean;
  includeAuditLog?: boolean;
}

export interface ExportZipDto {
  noteIds: string[];
  includeAttachments?: boolean;
}
