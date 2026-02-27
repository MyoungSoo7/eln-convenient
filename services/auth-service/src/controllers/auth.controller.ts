import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { IUser, IOrganization, ITeam, IRole } from '../interfaces/user.interface';

// ─── 더미 데이터 ───
const DUMMY_USER: IUser = {
  id: 'dev-user-001',
  orgId: 'org-001',
  email: 'researcher@labnote.dev',
  name: '김연구',
  roleId: 'role-admin',
  status: 'active',
  createdAt: new Date().toISOString(),
};

const DUMMY_ORGS: IOrganization[] = [
  { id: 'org-001', name: 'LabNote 연구소', slug: 'labnote-lab', createdAt: new Date().toISOString() },
];

const DUMMY_TEAMS: ITeam[] = [
  { id: 'team-001', orgId: 'org-001', name: '분자생물학팀', createdAt: new Date().toISOString() },
  { id: 'team-002', orgId: 'org-001', name: '화학분석팀', createdAt: new Date().toISOString() },
];

const DUMMY_ROLES: IRole[] = [
  { id: 'role-admin', orgId: 'org-001', name: 'admin', permissions: ['*'] },
  { id: 'role-researcher', orgId: 'org-001', name: 'researcher', permissions: ['note:read', 'note:write', 'inventory:read'] },
  { id: 'role-viewer', orgId: 'org-001', name: 'viewer', permissions: ['note:read', 'inventory:read'] },
];

// ─── 컨트롤러 ───

/** POST /api/auth/login */
export function login(req: Request, res: Response): void {
  const { email, password } = req.body;
  // TODO: 실제 인증 로직 (비밀번호 해싱 검증, DB 조회)
  console.log(`[auth] 로그인 시도: ${email}`);
  res.json({
    token: `dummy-jwt-token-${Date.now()}`,
    user: DUMMY_USER,
  });
}

/** POST /api/auth/logout */
export function logout(_req: Request, res: Response): void {
  // TODO: 토큰 블랙리스트 또는 세션 무효화
  res.json({ message: '로그아웃 완료' });
}

/** GET /api/auth/me */
export function getMe(_req: Request, res: Response): void {
  res.json(DUMMY_USER);
}

/** GET /api/auth/orgs */
export function getOrgs(_req: Request, res: Response): void {
  res.json(DUMMY_ORGS);
}

/** POST /api/auth/orgs */
export function createOrg(req: Request, res: Response): void {
  const org: IOrganization = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
  res.status(201).json(org);
}

/** GET /api/auth/teams */
export function getTeams(_req: Request, res: Response): void {
  res.json(DUMMY_TEAMS);
}

/** POST /api/auth/teams */
export function createTeam(req: Request, res: Response): void {
  const team: ITeam = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
  res.status(201).json(team);
}

/** GET /api/auth/users */
export function getUsers(_req: Request, res: Response): void {
  res.json([DUMMY_USER]);
}

/** POST /api/auth/users */
export function createUser(req: Request, res: Response): void {
  const user: IUser = {
    id: uuidv4(),
    orgId: req.body.orgId || 'org-001',
    email: req.body.email,
    name: req.body.name,
    roleId: req.body.roleId || 'role-researcher',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  // TODO: 비밀번호 해싱 후 DB 저장
  res.status(201).json(user);
}

/** PUT /api/auth/users/:id */
export function updateUser(req: Request, res: Response): void {
  // TODO: DB 업데이트
  res.json({ ...DUMMY_USER, ...req.body, id: req.params.id });
}

/** GET /api/auth/roles */
export function getRoles(_req: Request, res: Response): void {
  res.json(DUMMY_ROLES);
}

/** POST /api/auth/roles */
export function createRole(req: Request, res: Response): void {
  const role: IRole = { id: uuidv4(), ...req.body };
  res.status(201).json(role);
}

/** PUT /api/auth/roles/:id/permissions */
export function updatePermissions(req: Request, res: Response): void {
  // TODO: DB 업데이트
  res.json({ id: req.params.id, permissions: req.body.permissions, message: '권한 수정 완료' });
}
