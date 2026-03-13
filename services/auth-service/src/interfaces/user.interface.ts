export interface IUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  passwordHash?: string;
  roleId?: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
}

export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface ITeam {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
}

export interface IRole {
  id: string;
  orgId: string;
  name: string;
  permissions: string[];
}
