/**
 * 연구노트 서비스 DTO (Data Transfer Object) 정의
 * 
 * 노트 상태 흐름:
 *   draft(초안) ↔ in_progress(진행 중) → locked(잠김)
 *   locked → draft (관리자 잠금 해제 전용)
 */

/** 노트 상태 타입 */
export type NoteStatus = 'draft' | 'in_progress' | 'signed' | 'locked';

/** 노트 생성 DTO */
export interface CreateNoteDto {
  title: string;
  templateId?: string;
  tags?: string[];
  sections?: SectionDto[];
}

/** 노트 수정 DTO */
export interface UpdateNoteDto {
  title?: string;
  sections?: SectionDto[];
  tags?: string[];
}

/** 노트 상태 변경 DTO */
export interface ChangeStatusDto {
  status: NoteStatus;
}

/** 관리자 잠금 해제 DTO */
export interface AdminUnlockDto {
  adminPassword: string;
  reason?: string;
}

/** 섹션 DTO */
export interface SectionDto {
  type: string;
  title: string;
  content: string;
}

/** 노트 링크 추가 DTO */
export interface AddLinkDto {
  type: 'inventory' | 'equipment' | 'protocol' | 'note';
  targetId: string;
  label: string;
}

/** 템플릿 생성 DTO */
export interface CreateTemplateDto {
  name: string;
  category: string;
  sections: string[];
  description?: string;
}

/** 허용 가능한 상태 전환 맵 */
export const ALLOWED_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['draft', 'locked'],
  signed: [],
  locked: [],  // 관리자 잠금 해제는 별도 엔드포인트
};
