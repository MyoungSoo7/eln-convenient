export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  name: string;
  email: string;
  password: string;
  orgId?: string;
  teamId?: string;
}

export interface CreateOrgDto {
  name: string;
  description?: string;
}

export interface CreateTeamDto {
  name: string;
  orgId: string;
}

export interface CreateRoleDto {
  name: string;
  permissions: string[];
}
