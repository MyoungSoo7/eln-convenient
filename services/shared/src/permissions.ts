/**
 * 권한 상수 및 역할별 권한 매핑
 * 모든 서비스에서 이 상수를 사용하여 권한 문자열 일관성 보장
 */

// ─── 권한 상수 ──────────────────────────────────

export const Permission = {
  // 노트
  NOTE_READ:    'note:read',
  NOTE_WRITE:   'note:write',
  NOTE_DELETE:  'note:delete',
  NOTE_STATUS:  'note:status',
  NOTE_SIGN:    'note:sign',
  NOTE_UNLOCK:  'note:unlock',

  // 템플릿
  TEMPLATE_READ:   'template:read',
  TEMPLATE_WRITE:  'template:write',
  TEMPLATE_DELETE: 'template:delete',

  // 인벤토리
  INVENTORY_READ:   'inventory:read',
  INVENTORY_WRITE:  'inventory:write',
  INVENTORY_DELETE: 'inventory:delete',

  // 스케줄러
  SCHEDULER_READ:   'scheduler:read',
  SCHEDULER_WRITE:  'scheduler:write',
  SCHEDULER_MANAGE: 'scheduler:manage',

  // 장비 리소스
  RESOURCE_WRITE: 'resource:write',

  // 파일
  FILE_READ:   'file:read',
  FILE_UPLOAD: 'file:upload',
  FILE_DELETE: 'file:delete',

  // 사용자 관리
  USER_READ:   'user:read',
  USER_WRITE:  'user:write',
  USER_DELETE: 'user:delete',

  // 감사/내보내기
  AUDIT_READ: 'audit:read',
  EXPORT_PDF: 'export:pdf',
} as const;

export type PermissionValue = typeof Permission[keyof typeof Permission];

// ─── 역할명 ─────────────────────────────────────

export const RoleName = {
  ADMIN:        'admin',
  RESEARCHER:   'researcher',
  REVIEWER:     'reviewer',
  VIEWER:       'viewer',
} as const;

export type RoleNameValue = typeof RoleName[keyof typeof RoleName];

// ─── 역할별 기본 권한 ─────────────────────────────

export const RolePermissions: Record<RoleNameValue, readonly string[]> = {
  [RoleName.ADMIN]: ['*'],

  [RoleName.RESEARCHER]: [
    Permission.NOTE_READ, Permission.NOTE_WRITE, Permission.NOTE_STATUS,
    Permission.TEMPLATE_READ, Permission.TEMPLATE_WRITE,
    Permission.INVENTORY_READ, Permission.INVENTORY_WRITE,
    Permission.SCHEDULER_READ, Permission.SCHEDULER_WRITE,
    Permission.FILE_UPLOAD, Permission.FILE_READ,
    Permission.EXPORT_PDF,
  ],

  [RoleName.REVIEWER]: [
    Permission.NOTE_READ, Permission.NOTE_STATUS, Permission.NOTE_SIGN,
    Permission.TEMPLATE_READ,
    Permission.INVENTORY_READ, Permission.INVENTORY_WRITE,
    Permission.SCHEDULER_READ, Permission.SCHEDULER_WRITE, Permission.SCHEDULER_MANAGE,
    Permission.RESOURCE_WRITE,
    Permission.FILE_READ,
    Permission.AUDIT_READ,
  ],

  [RoleName.VIEWER]: [
    Permission.NOTE_READ,
    Permission.TEMPLATE_READ,
    Permission.INVENTORY_READ,
    Permission.SCHEDULER_READ,
    Permission.FILE_READ,
  ],
};
