/** 서명 요청 DTO */
export interface SignNoteDto {
  password: string; // 서명 확인용
}

/** 내보내기 요청 DTO */
export interface ExportRequestDto {
  format: 'pdf' | 'zip';
}

/** ZIP 내보내기 요청 DTO */
export interface BulkExportDto {
  noteIds: string[];
}
