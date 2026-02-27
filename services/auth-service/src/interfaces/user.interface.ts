/** 사용자 인터페이스 */
export interface IUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  roleId: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
}

/** 조직 인터페이스 */
export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/** 팀 인터페이스 */
export interface ITeam {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
}

/** 역할 인터페이스 */
export interface IRole {
  id: string;
  orgId: string;
  name: string;
  permissions: string[];
}

/** 로그인 응답 */
export interface ILoginResponse {
  token: string;
  user: IUser;
}
