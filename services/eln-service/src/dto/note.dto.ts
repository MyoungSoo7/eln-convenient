/** 노트 생성 DTO */
export interface CreateNoteDto {
  title: string;
  content?: string;
  templateId?: string;
  tags?: string[];
}

/** 노트 수정 DTO */
export interface UpdateNoteDto {
  title?: string;
  content?: string;
  status?: 'draft' | 'in_review' | 'signed' | 'locked';
  tags?: string[];
}

/** 템플릿 생성 DTO */
export interface CreateTemplateDto {
  title: string;
  description?: string;
  content: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}

/** 첨부파일 등록 DTO */
export interface CreateAttachmentDto {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** 노트 링크 생성 DTO */
export interface CreateNoteLinkDto {
  targetType: 'inventory_item' | 'resource' | 'note';
  targetId: string;
}
