export interface CreateNoteDto {
  title: string;
  templateId?: string;
  tags?: string[];
  sections?: SectionDto[];
}

export interface UpdateNoteDto {
  title?: string;
  status?: 'draft' | 'in_review' | 'signed' | 'locked';
  sections?: SectionDto[];
  tags?: string[];
}

export interface SectionDto {
  type: string;
  title: string;
  content: string;
}

export interface AddLinkDto {
  type: 'inventory' | 'equipment' | 'protocol' | 'note';
  targetId: string;
  label: string;
}

export interface CreateTemplateDto {
  name: string;
  category: string;
  sections: string[];
  description?: string;
}
