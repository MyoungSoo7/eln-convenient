import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import redis from '../lib/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    return;
  }
  if (user.status !== 'active') {
    res.status(403).json({ error: '비활성화된 계정입니다.' });
    return;
  }
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role?.name ?? 'viewer' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
  res.json({
    token,
    user: {
      id: user.id,
      orgId: user.orgId,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      role: user.role?.name ?? 'viewer',
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    },
  });
}

/** POST /api/auth/logout — Redis 블랙리스트에 토큰 등록 */
export async function logout(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 28800;
      if (ttl > 0) {
        await redis.set(`blacklist:${token}`, '1', 'EX', ttl);
      }
    } catch {
      // Redis 오류 무시 — 로그아웃은 항상 성공
    }
  }
  res.json({ message: '로그아웃 완료' });
}

/** GET /api/auth/me */
export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) { res.status(401).json({ error: '인증 정보가 없습니다.' }); return; }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, org: true },
  });
  if (!user) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  res.json({
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    roleId: user.roleId,
    role: user.role?.name,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  });
}

/** GET /api/auth/users */
export async function getUsers(_req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users.map((u) => ({
    id: u.id, orgId: u.orgId, email: u.email, name: u.name,
    roleId: u.roleId, role: u.role?.name, status: u.status,
    createdAt: u.createdAt.toISOString(),
  })));
}

/** POST /api/auth/users */
export async function createUser(req: Request, res: Response): Promise<void> {
  const { email, name, password, orgId, roleId } = req.body;
  if (!email || !name || !password) {
    res.status(400).json({ error: 'email, name, password는 필수입니다.' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      id: uuidv4(),
      email,
      name,
      passwordHash,
      orgId: orgId || req.body.orgId,
      roleId: roleId || null,
      status: 'active',
    },
  });
  res.status(201).json({
    id: user.id, orgId: user.orgId, email: user.email, name: user.name,
    roleId: user.roleId, status: user.status, createdAt: user.createdAt.toISOString(),
  });
}

/** PUT /api/auth/users/:id */
export async function updateUser(req: Request, res: Response): Promise<void> {
  const { name, roleId, status } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(roleId && { roleId }),
      ...(status && { status }),
    },
  });
  res.json({
    id: user.id, orgId: user.orgId, email: user.email, name: user.name,
    roleId: user.roleId, status: user.status, updatedAt: user.updatedAt.toISOString(),
  });
}

/** GET /api/auth/orgs */
export async function getOrgs(_req: Request, res: Response): Promise<void> {
  const orgs = await prisma.organization.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, createdAt: o.createdAt.toISOString() })));
}

/** POST /api/auth/orgs */
export async function createOrg(req: Request, res: Response): Promise<void> {
  const { name, slug } = req.body;
  if (!name || !slug) { res.status(400).json({ error: 'name과 slug는 필수입니다.' }); return; }
  const org = await prisma.organization.create({ data: { id: uuidv4(), name, slug } });
  res.status(201).json({ id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt.toISOString() });
}

/** GET /api/auth/teams */
export async function getTeams(_req: Request, res: Response): Promise<void> {
  const teams = await prisma.team.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(teams.map((t) => ({ id: t.id, orgId: t.orgId, name: t.name, createdAt: t.createdAt.toISOString() })));
}

/** POST /api/auth/teams */
export async function createTeam(req: Request, res: Response): Promise<void> {
  const { orgId, name } = req.body;
  if (!orgId || !name) { res.status(400).json({ error: 'orgId와 name은 필수입니다.' }); return; }
  const team = await prisma.team.create({ data: { id: uuidv4(), orgId, name } });
  res.status(201).json({ id: team.id, orgId: team.orgId, name: team.name, createdAt: team.createdAt.toISOString() });
}

/** GET /api/auth/roles */
export async function getRoles(_req: Request, res: Response): Promise<void> {
  const roles = await prisma.role.findMany();
  res.json(roles.map((r) => ({ id: r.id, orgId: r.orgId, name: r.name, permissions: r.permissions })));
}

/** POST /api/auth/roles */
export async function createRole(req: Request, res: Response): Promise<void> {
  const { orgId, name, permissions } = req.body;
  if (!orgId || !name) { res.status(400).json({ error: 'orgId와 name은 필수입니다.' }); return; }
  const role = await prisma.role.create({ data: { id: uuidv4(), orgId, name, permissions: permissions || [] } });
  res.status(201).json({ id: role.id, orgId: role.orgId, name: role.name, permissions: role.permissions });
}

/** PUT /api/auth/roles/:id/permissions */
export async function updatePermissions(req: Request, res: Response): Promise<void> {
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) { res.status(400).json({ error: 'permissions는 배열이어야 합니다.' }); return; }
  const role = await prisma.role.update({ where: { id: req.params.id }, data: { permissions } });
  res.json({ id: role.id, permissions: role.permissions, message: '권한 수정 완료' });
}
