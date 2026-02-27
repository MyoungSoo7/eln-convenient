/** 로그인 요청 DTO */
export interface LoginRequestDto {
  email: string;
  password: string;
}

/** 사용자 생성 DTO */
export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  roleId?: string;
  orgId: string;
}

/** 사용자 수정 DTO */
export interface UpdateUserDto {
  name?: string;
  roleId?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

/** 조직 생성 DTO */
export interface CreateOrgDto {
  name: string;
  slug: string;
}

/** 팀 생성 DTO */
export interface CreateTeamDto {
  name: string;
  orgId: string;
}

/** 역할 생성 DTO */
export interface CreateRoleDto {
  name: string;
  orgId: string;
  permissions: string[];
}

/** 역할 권한 수정 DTO */
export interface UpdatePermissionsDto {
  permissions: string[];
}
