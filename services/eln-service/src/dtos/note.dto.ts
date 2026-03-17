/**
 * 연구노트 서비스 DTO
 *
 * 노트/프로토콜 상태 흐름:
 *   draft ↔ in_progress → signed (서명)
 *                       → locked  (잠금)
 *   locked → draft  (관리자 잠금 해제)
 */

/** 노트 타입 */
export type NoteType = 'note' | 'protocol';

/** 노트 상태 */
export type NoteStatus = 'draft' | 'in_progress' | 'signed' | 'locked';

/** 섹션 DTO */
export interface SectionDto {
  type: string;
  title: string;
  content: string;
  order?: number;
}

/** 노트/프로토콜 생성 DTO */
export interface CreateNoteDto {
  title: string;
  type?: NoteType;
  content?: string;
  sections?: SectionDto[];
  templateId?: string;
  tags?: string[];
}

/** 노트/프로토콜 수정 DTO */
export interface UpdateNoteDto {
  title?: string;
  content?: string;
  sections?: SectionDto[];
  tags?: string[];
  changeSummary?: string;
}

/** 상태 변경 DTO */
export interface ChangeStatusDto {
  status: NoteStatus;
}

/** 관리자 잠금 해제 DTO */
export interface AdminUnlockDto {
  adminPassword: string;
  reason?: string;
}

/** 노트 링크 추가 DTO */
export interface AddLinkDto {
  targetType: 'inventory' | 'equipment' | 'protocol' | 'note';
  targetId: string;
  label?: string;
}

/** 템플릿 생성 DTO */
export interface CreateTemplateDto {
  title: string;
  category?: string;
  description?: string;
  content?: string;
  sections?: SectionDto[];
  tags?: string[];
  isPublic?: boolean;
}

/** 템플릿 수정 DTO */
export interface UpdateTemplateDto {
  title?: string;
  category?: string;
  description?: string;
  content?: string;
  sections?: SectionDto[];
  tags?: string[];
  isPublic?: boolean;
}

/**
 * 허용 상태 전환 맵
 * in_progress → signed: 서명 서비스가 PATCH /notes/:id/status 호출
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft:       ['in_progress'],
  in_progress: ['draft', 'signed', 'locked'],
  signed:      [],              // 서명 완료는 불변
  locked:      [],              // 관리자 잠금 해제는 별도 엔드포인트
};
