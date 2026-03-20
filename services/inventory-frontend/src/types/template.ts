export type NoteType = 'note' | 'template';
export type NoteStatus = 'draft' | 'in_progress' | 'signed' | 'locked';

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  draft: '초안',
  in_progress: '진행 중',
  signed: '서명 완료',
  locked: '잠김',
};

export const NOTE_STATUS_COLORS: Record<NoteStatus, string> = {
  draft: '#6b7280',
  in_progress: '#2563eb',
  signed: '#16a34a',
  locked: '#dc2626',
};

export interface TemplateDoc {
  id: string;
  type: NoteType;
  title: string;
  content: string;
  sections: Record<string, unknown>;
  status: NoteStatus;
  authorId: string;
  templateId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  content: string;
  sections: Record<string, unknown>;
  tags: string[];
  isPublic: boolean;
  createdBy: string;
  useCount: number;
  copyCount: number;
  copiedFromId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateFilters {
  search: string;
  category: string;
  publicOnly: boolean;
  sortBy: string;
  page: number;
  limit: number;
}

export interface CreateTemplateDocDto {
  title: string;
  content?: string;
  type: 'template';
  templateId?: string;
  tags?: string[];
  sections?: Record<string, unknown>;
}

export interface CreateTemplateDto {
  title: string;
  description?: string;
  category?: string;
  content?: string;
  sections?: Record<string, unknown>;
  tags?: string[];
  isPublic?: boolean;
}

export interface TemplateDocFilters {
  q: string;
  status: NoteStatus | '';
  tag: string;
  page: number;
  limit: number;
}
