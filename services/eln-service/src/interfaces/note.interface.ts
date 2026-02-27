/** 연구노트 인터페이스 */
export interface INote {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'in_review' | 'signed' | 'locked';
  authorId: string;
  templateId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** 노트 리비전 인터페이스 */
export interface INoteRevision {
  id: string;
  noteId: string;
  revision: number;
  content: string;
  changedBy: string;
  changeSummary: string;
  createdAt: string;
}

/** 템플릿(프로토콜) 인터페이스 */
export interface ITemplate {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  createdBy: string;
  isPublic: boolean;
  createdAt: string;
}

/** 노트 링크 인터페이스 */
export interface INoteLink {
  id: string;
  noteId: string;
  targetType: 'inventory_item' | 'resource' | 'note';
  targetId: string;
  createdAt: string;
}

/** 첨부파일 메타 인터페이스 */
export interface IAttachment {
  id: string;
  noteId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
