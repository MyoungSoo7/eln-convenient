import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { writeAuditLog } from '../lib/audit';
import { invalidateUserTokens } from '../lib/token-invalidation';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. 서버를 시작할 수 없습니다.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

// ─────────────────────────────────────────────
// 인증
// ─────────────────────────────────────────────

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
      return;
    }
    if (user.status !== 'active') {
      res.status(403).json({ ok: false, error: '비활성화된 계정입니다.' });
      return;
    }
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role?.name ?? 'viewer',
        permissions: user.role?.permissions ?? [],
        orgId: user.orgId,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );
    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '8h' } as jwt.SignOptions,
    );
    res.json({
      ok: true,
      data: {
        token,
        refreshToken,
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
      },
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ ok: false, error: '로그인 처리 중 오류가 발생했습니다.' });
  }
}

/** POST /api/auth/refresh — Refresh token으로 새 access token 발급 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken: incomingRefresh } = req.body;
  const userId = req.headers['x-user-id'] as string;

  if (!incomingRefresh) {
    res.status(401).json({ ok: false, error: 'Refresh token이 필요합니다.' });
    return;
  }

  try {
    // Verify the refresh token
    const decoded = jwt.verify(incomingRefresh, JWT_SECRET) as { sub: string; type: string };
    if (decoded.type !== 'refresh') {
      res.status(401).json({ ok: false, error: '유효하지 않은 refresh token입니다.' });
      return;
    }

    const targetUserId = userId || decoded.sub;
    if (!targetUserId) {
      res.status(401).json({ ok: false, error: '사용자 정보를 확인할 수 없습니다.' });
      return;
    }

    // userId가 있으면 refresh token의 sub와 일치하는지 확인
    if (userId && decoded.sub !== userId) {
      res.status(401).json({ ok: false, error: '유효하지 않은 refresh token입니다.' });
      return;
    }

    // Fetch fresh user data
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { role: true },
    });
    if (!user || user.status !== 'active') {
      res.status(401).json({ ok: false, error: '비활성화된 계정입니다.' });
      return;
    }

    // Issue new tokens
    const newAccessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role?.name ?? 'viewer',
        permissions: user.role?.permissions ?? [],
        orgId: user.orgId,
      },
      JWT_SECRET,
      { expiresIn: '15m' } as jwt.SignOptions,
    );

    const newRefreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '8h' } as jwt.SignOptions,
    );

    res.json({
      ok: true,
      data: { token: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch {
    res.status(401).json({ ok: false, error: 'Refresh token이 만료되었습니다.' });
  }
}

/** POST /api/auth/register */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, name, password, orgId } = req.body;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ ok: false, error: '이미 사용 중인 이메일입니다.' });
      return;
    }

    // 기본 조직 확인 (orgId 미제공 시 첫 번째 조직 사용)
    let resolvedOrgId = orgId;
    if (!resolvedOrgId) {
      const defaultOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!defaultOrg) {
        res.status(400).json({ ok: false, error: '등록 가능한 조직이 없습니다.' });
        return;
      }
      resolvedOrgId = defaultOrg.id;
    }

    // viewer 역할 자동 부여
    const viewerRole = await prisma.role.findFirst({
      where: { orgId: resolvedOrgId, name: 'viewer' },
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email,
        name,
        passwordHash,
        orgId: resolvedOrgId,
        roleId: viewerRole?.id ?? null,
        status: 'active',
      },
      include: { role: true },
    });

    res.status(201).json({
      ok: true,
      data: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        name: user.name,
        role: user.role?.name ?? 'viewer',
        status: user.status,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ ok: false, error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
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
  res.json({ ok: true, message: '로그아웃 완료' });
}

/** GET /api/auth/me */
export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    res.status(401).json({ ok: false, error: '인증 정보가 없습니다.' });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, org: true },
    });
    if (!user) {
      res.status(404).json({ ok: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }
    res.json({
      ok: true,
      data: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        name: user.name,
        roleId: user.roleId,
        role: user.role?.name,
        permissions: user.role?.permissions ?? [],
        status: user.status,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[getMe]', err);
    res.status(500).json({ ok: false, error: '사용자 조회 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 사용자
// ─────────────────────────────────────────────

/** GET /api/auth/users */
export async function getUsers(req: Request, res: Response): Promise<void> {
  const orgId = req.headers['x-user-org-id'] as string | undefined;
  try {
    const users = await prisma.user.findMany({
      where: orgId ? { orgId } : undefined,
      include: { role: true, teamMembers: { include: { team: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      ok: true,
      data: users.map((u: any) => ({
        id: u.id, orgId: u.orgId, email: u.email, name: u.name,
        roleId: u.roleId, role: u.role?.name, status: u.status,
        team: u.teamMembers[0]?.team?.name ?? null,
        teamId: u.teamMembers[0]?.team?.id ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[getUsers]', err);
    res.status(500).json({ ok: false, error: '사용자 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/auth/users (admin) */
export async function createUser(req: Request, res: Response): Promise<void> {
  const { email, name, password, orgId, roleId } = req.body;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ ok: false, error: '이미 사용 중인 이메일입니다.' });
      return;
    }

    // orgId 미제공 시 첫 번째 조직으로 자동 연결
    let resolvedOrgId = orgId;
    if (!resolvedOrgId) {
      const defaultOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!defaultOrg) {
        res.status(400).json({ ok: false, error: '등록 가능한 조직이 없습니다.' });
        return;
      }
      resolvedOrgId = defaultOrg.id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email,
        name,
        passwordHash,
        orgId: resolvedOrgId,
        roleId: roleId || null,
        status: 'active',
      },
    });
    res.status(201).json({
      ok: true,
      data: {
        id: user.id, orgId: user.orgId, email: user.email, name: user.name,
        roleId: user.roleId, status: user.status, createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[createUser]', err);
    res.status(500).json({ ok: false, error: '사용자 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/auth/users/:id (admin) */
export async function updateUser(req: Request, res: Response): Promise<void> {
  const { name, roleId, status } = req.body;
  const actorId = req.headers['x-user-id'] as string;
  try {
    // 변경 전 상태 캡처 (감사 로그용)
    const before = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true },
    });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(roleId !== undefined && { roleId }),
        ...(status !== undefined && { status }),
      },
      include: { role: true },
    });

    // 역할 변경 감사 로그
    if (roleId !== undefined && before && before.roleId !== roleId) {
      writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'role_change',
        actorId,
        details: {
          beforeRole: before.role?.name ?? null,
          beforeRoleId: before.roleId,
          afterRole: user.role?.name ?? null,
          afterRoleId: user.roleId,
          userEmail: user.email,
        },
      });
    }

    // 상태 변경 감사 로그
    if (status !== undefined && before && before.status !== status) {
      writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'status_change',
        actorId,
        details: {
          beforeStatus: before.status,
          afterStatus: status,
          userEmail: user.email,
        },
      });
    }

    // 역할 또는 상태가 변경되면 기존 토큰 무효화 (재로그인 강제)
    const roleChanged = roleId !== undefined && before && before.roleId !== roleId;
    const statusChanged = status !== undefined && before && before.status !== status;
    if (roleChanged || statusChanged) {
      invalidateUserTokens(req.params.id);
    }

    res.json({
      ok: true,
      data: {
        id: user.id, orgId: user.orgId, email: user.email, name: user.name,
        roleId: user.roleId, status: user.status, updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }
    console.error('[updateUser]', err);
    res.status(500).json({ ok: false, error: '사용자 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/auth/users/:id (admin) */
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const callerId = req.headers['x-user-id'] as string;
  if (req.params.id === callerId) {
    res.status(400).json({ ok: false, error: '자기 자신은 삭제할 수 없습니다.' });
    return;
  }
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true },
    });

    await prisma.teamMember.deleteMany({ where: { userId: req.params.id } });
    await prisma.user.delete({ where: { id: req.params.id } });

    if (target) {
      writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'user_delete',
        actorId: callerId,
        details: {
          deletedEmail: target.email,
          deletedName: target.name,
          deletedRole: target.role?.name ?? null,
        },
      });
    }

    res.json({ ok: true, message: '사용자가 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteUser]', err);
    res.status(500).json({ ok: false, error: '사용자 삭제 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 조직
// ─────────────────────────────────────────────

/** GET /api/auth/orgs */
export async function getOrgs(_req: Request, res: Response): Promise<void> {
  try {
    const orgs = await prisma.organization.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({
      ok: true,
      data: orgs.map((o: any) => ({
        id: o.id, name: o.name, slug: o.slug, createdAt: o.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[getOrgs]', err);
    res.status(500).json({ ok: false, error: '조직 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/auth/orgs (admin) */
export async function createOrg(req: Request, res: Response): Promise<void> {
  const { name, slug } = req.body;
  try {
    const org = await prisma.organization.create({ data: { id: uuidv4(), name, slug } });
    res.status(201).json({
      ok: true,
      data: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt.toISOString() },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 사용 중인 slug입니다.' });
      return;
    }
    console.error('[createOrg]', err);
    res.status(500).json({ ok: false, error: '조직 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/auth/orgs/:id (admin) */
export async function updateOrg(req: Request, res: Response): Promise<void> {
  const { name, slug } = req.body;
  try {
    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
      },
    });
    res.json({
      ok: true,
      data: { id: org.id, name: org.name, slug: org.slug, updatedAt: org.updatedAt.toISOString() },
    });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '조직을 찾을 수 없습니다.' });
      return;
    }
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 사용 중인 slug입니다.' });
      return;
    }
    console.error('[updateOrg]', err);
    res.status(500).json({ ok: false, error: '조직 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/auth/orgs/:id (admin) */
export async function deleteOrg(req: Request, res: Response): Promise<void> {
  try {
    const userCount = await prisma.user.count({ where: { orgId: req.params.id } });
    if (userCount > 0) {
      res.status(400).json({ ok: false, error: `소속 사용자가 ${userCount}명 있어 삭제할 수 없습니다.` });
      return;
    }
    await prisma.organization.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '조직이 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '조직을 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteOrg]', err);
    res.status(500).json({ ok: false, error: '조직 삭제 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 팀
// ─────────────────────────────────────────────

/** GET /api/auth/teams */
export async function getTeams(req: Request, res: Response): Promise<void> {
  const orgId = req.headers['x-user-org-id'] as string | undefined;
  try {
    const teams = await prisma.team.findMany({
      where: orgId ? { orgId } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    res.json({
      ok: true,
      data: teams.map((t: any) => ({
        id: t.id, orgId: t.orgId, name: t.name,
        memberCount: t._count.members,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[getTeams]', err);
    res.status(500).json({ ok: false, error: '팀 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/auth/teams (admin) */
export async function createTeam(req: Request, res: Response): Promise<void> {
  const { orgId, name } = req.body;
  try {
    const team = await prisma.team.create({ data: { id: uuidv4(), orgId, name } });
    res.status(201).json({
      ok: true,
      data: { id: team.id, orgId: team.orgId, name: team.name, createdAt: team.createdAt.toISOString() },
    });
  } catch (err) {
    console.error('[createTeam]', err);
    res.status(500).json({ ok: false, error: '팀 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/auth/teams/:id (admin) */
export async function updateTeam(req: Request, res: Response): Promise<void> {
  const { name } = req.body;
  try {
    const team = await prisma.team.update({
      where: { id: req.params.id },
      data: { name },
    });
    res.json({
      ok: true,
      data: { id: team.id, orgId: team.orgId, name: team.name, updatedAt: team.updatedAt.toISOString() },
    });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '팀을 찾을 수 없습니다.' });
      return;
    }
    console.error('[updateTeam]', err);
    res.status(500).json({ ok: false, error: '팀 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/auth/teams/:id (admin) */
export async function deleteTeam(req: Request, res: Response): Promise<void> {
  try {
    await prisma.teamMember.deleteMany({ where: { teamId: req.params.id } });
    await prisma.team.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '팀이 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '팀을 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteTeam]', err);
    res.status(500).json({ ok: false, error: '팀 삭제 중 오류가 발생했습니다.' });
  }
}

/** GET /api/auth/teams/:id/members */
export async function getTeamMembers(req: Request, res: Response): Promise<void> {
  try {
    const members = await prisma.teamMember.findMany({
      where: { teamId: req.params.id },
      include: { user: { include: { role: true } } },
    });
    res.json({
      ok: true,
      data: members.map((m: any) => ({
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.user.role?.name,
        status: m.user.status,
      })),
    });
  } catch (err) {
    console.error('[getTeamMembers]', err);
    res.status(500).json({ ok: false, error: '팀 멤버 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/auth/teams/:id/members (admin) */
export async function addTeamMember(req: Request, res: Response): Promise<void> {
  const { userId } = req.body;
  try {
    await prisma.teamMember.create({
      data: { userId, teamId: req.params.id },
    });
    res.status(201).json({ ok: true, message: '팀에 멤버가 추가되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ ok: false, error: '이미 팀에 소속된 사용자입니다.' });
      return;
    }
    console.error('[addTeamMember]', err);
    res.status(500).json({ ok: false, error: '팀 멤버 추가 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/auth/teams/:id/members/:userId (admin) */
export async function removeTeamMember(req: Request, res: Response): Promise<void> {
  try {
    await prisma.teamMember.delete({
      where: { userId_teamId: { userId: req.params.userId, teamId: req.params.id } },
    });
    res.json({ ok: true, message: '팀에서 멤버가 제거되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '해당 팀 멤버를 찾을 수 없습니다.' });
      return;
    }
    console.error('[removeTeamMember]', err);
    res.status(500).json({ ok: false, error: '팀 멤버 제거 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 역할
// ─────────────────────────────────────────────

/** GET /api/auth/roles */
export async function getRoles(req: Request, res: Response): Promise<void> {
  const orgId = req.headers['x-user-org-id'] as string | undefined;
  try {
    const roles = await prisma.role.findMany({
      where: orgId ? { orgId } : undefined,
      include: { _count: { select: { users: true } } },
    });
    res.json({
      ok: true,
      data: roles.map((r: any) => ({
        id: r.id, orgId: r.orgId, name: r.name, permissions: r.permissions,
        userCount: r._count.users,
      })),
    });
  } catch (err) {
    console.error('[getRoles]', err);
    res.status(500).json({ ok: false, error: '역할 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/auth/roles (admin) */
const ALLOWED_ROLE_NAMES = ['admin', 'researcher', 'reviewer', 'viewer'] as const;

export async function createRole(req: Request, res: Response): Promise<void> {
  const { orgId, name, permissions } = req.body;

  if (!ALLOWED_ROLE_NAMES.includes(name)) {
    res.status(400).json({
      ok: false,
      error: `허용되지 않는 역할명입니다. 사용 가능: ${ALLOWED_ROLE_NAMES.join(', ')}`,
    });
    return;
  }

  try {
    const role = await prisma.role.create({
      data: { id: uuidv4(), orgId, name, permissions: permissions || [] },
    });
    res.status(201).json({
      ok: true,
      data: { id: role.id, orgId: role.orgId, name: role.name, permissions: role.permissions },
    });
  } catch (err) {
    console.error('[createRole]', err);
    res.status(500).json({ ok: false, error: '역할 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/auth/roles/:id/permissions (admin) */
export async function updatePermissions(req: Request, res: Response): Promise<void> {
  const { permissions } = req.body;
  const actorId = req.headers['x-user-id'] as string;
  try {
    const before = await prisma.role.findUnique({ where: { id: req.params.id } });

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { permissions },
    });

    if (before) {
      writeAuditLog({
        entityType: 'role',
        entityId: req.params.id,
        action: 'permission_update',
        actorId,
        details: {
          roleName: role.name,
          beforePermissions: before.permissions,
          afterPermissions: role.permissions,
        },
      });
    }

    // Redis 역할 권한 캐시 무효화 (api-gateway 캐시)
    try { await redis.del(`role-perms:${role.name}`); } catch { /* 무시 */ }

    res.json({ ok: true, data: { id: role.id, permissions: role.permissions }, message: '권한 수정 완료' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '역할을 찾을 수 없습니다.' });
      return;
    }
    console.error('[updatePermissions]', err);
    res.status(500).json({ ok: false, error: '권한 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/auth/roles/:id (admin) */
export async function deleteRole(req: Request, res: Response): Promise<void> {
  try {
    const userCount = await prisma.user.count({ where: { roleId: req.params.id } });
    if (userCount > 0) {
      res.status(400).json({ ok: false, error: `해당 역할을 가진 사용자가 ${userCount}명 있어 삭제할 수 없습니다.` });
      return;
    }
    await prisma.role.delete({ where: { id: req.params.id } });
    res.json({ ok: true, message: '역할이 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '역할을 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteRole]', err);
    res.status(500).json({ ok: false, error: '역할 삭제 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 내부 서비스용 역할 권한 조회
// ─────────────────────────────────────────────

/**
 * GET /api/auth/internal/role-permissions?role=researcher&orgId=xxx
 * 서비스 간 내부 호출 전용 — API Gateway Keycloak 분기에서 역할→권한 매핑 시 사용
 */
export async function getRolePermissions(req: Request, res: Response): Promise<void> {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret) {
    res.status(404).json({ ok: false, error: 'Not Found' });
    return;
  }
  const incoming = req.headers['x-internal-secret'];
  if (incoming !== internalSecret) {
    res.status(401).json({ ok: false, error: '내부 요청 인증 실패' });
    return;
  }

  const roleName = req.query.role as string;
  const orgId = req.query.orgId as string | undefined;

  if (!roleName) {
    res.status(400).json({ ok: false, error: 'role 파라미터가 필요합니다.' });
    return;
  }

  try {
    const where: any = { name: roleName };
    if (orgId) where.orgId = orgId;

    const role = await prisma.role.findFirst({ where });
    if (!role) {
      res.json({ ok: true, permissions: [] });
      return;
    }
    res.json({ ok: true, permissions: role.permissions });
  } catch (err) {
    console.error('[getRolePermissions]', err);
    res.status(500).json({ ok: false, error: '역할 권한 조회 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 내부 서비스용 비밀번호 검증
// ─────────────────────────────────────────────

/**
 * POST /api/auth/internal/verify-password
 * 서비스 간 내부 호출 전용 — signature-service 등에서 서명 확인 시 사용
 * 헤더: x-internal-secret (환경변수 INTERNAL_SECRET 검증)
 */
export async function verifyPassword(req: Request, res: Response): Promise<void> {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret) {
    res.status(404).json({ ok: false, error: 'Not Found' });
    return;
  }
  const incoming = req.headers['x-internal-secret'];
  if (incoming !== internalSecret) {
    res.status(401).json({ ok: false, error: '내부 요청 인증 실패' });
    return;
  }

  const { userId, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      res.status(200).json({ ok: true, verified: false });
      return;
    }
    const verified = await bcrypt.compare(password, user.passwordHash);
    res.json({ ok: true, verified });
  } catch (err) {
    console.error('[verifyPassword]', err);
    res.status(500).json({ ok: false, error: '비밀번호 검증 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// SSO 훅 — Keycloak Event Webhook
// ─────────────────────────────────────────────

/**
 * POST /api/auth/sso-hook
 *
 * Keycloak → auth-service 이벤트 수신
 * Keycloak Admin Console > Events > Event Listeners > HTTP 설정 후 사용
 * 지원 이벤트: REGISTER, LOGIN, UPDATE_PROFILE, DELETE_ACCOUNT
 *
 * 헤더: x-keycloak-secret (환경변수 KEYCLOAK_HOOK_SECRET 검증)
 */
export async function ssoHook(req: Request, res: Response): Promise<void> {
  const hookSecret = process.env.KEYCLOAK_HOOK_SECRET;
  if (!hookSecret) {
    // KEYCLOAK_HOOK_SECRET 미설정 시 webhook 비활성화 — 404로 응답
    res.status(404).json({ ok: false, error: 'Not Found' });
    return;
  }
  const incoming = req.headers['x-keycloak-secret'];
  if (incoming !== hookSecret) {
    res.status(401).json({ ok: false, error: '유효하지 않은 훅 시크릿입니다.' });
    return;
  }

  const { type, userId: kcUserId, details } = req.body as {
    type: string;
    userId?: string;
    details?: Record<string, string>;
  };

  try {
    switch (type) {
      // 신규 사용자 Keycloak 등록 → 로컬 DB 동기화
      case 'REGISTER': {
        const email = details?.email;
        const username = details?.username ?? email ?? '';
        if (!email) {
          res.status(400).json({ ok: false, error: 'REGISTER 이벤트에 email이 없습니다.' });
          return;
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          // 이미 있으면 keycloak userId를 메모하거나 업데이트 없이 통과
          res.json({ ok: true, message: '이미 등록된 사용자입니다.', userId: existing.id });
          return;
        }

        const defaultOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
        const viewerRole = defaultOrg
          ? await prisma.role.findFirst({ where: { orgId: defaultOrg.id, name: 'viewer' } })
          : null;

        const newUser = await prisma.user.create({
          data: {
            id: kcUserId ?? uuidv4(),
            orgId: defaultOrg?.id ?? '',
            email,
            name: username,
            passwordHash: '', // SSO 사용자는 로컬 비밀번호 없음
            roleId: viewerRole?.id ?? null,
            status: 'active',
          },
        });

        console.log(`[sso-hook] REGISTER: ${newUser.email} (${newUser.id})`);
        res.status(201).json({ ok: true, message: 'SSO 사용자 등록 완료', userId: newUser.id });
        break;
      }

      // 로그인 이벤트 — 마지막 로그인 시간 기록 (향후 확장)
      case 'LOGIN': {
        const email = details?.email;
        if (email) {
          console.log(`[sso-hook] LOGIN: ${email}`);
        }
        res.json({ ok: true, message: 'LOGIN 이벤트 수신' });
        break;
      }

      // 프로필 업데이트 → 로컬 DB 이름 동기화
      case 'UPDATE_PROFILE': {
        const email = details?.email;
        const newName = details?.updated_first_name
          ? `${details.updated_first_name} ${details.updated_last_name ?? ''}`.trim()
          : null;

        if (email && newName) {
          await prisma.user.updateMany({
            where: { email },
            data: { name: newName },
          });
          console.log(`[sso-hook] UPDATE_PROFILE: ${email} → ${newName}`);
        }
        res.json({ ok: true, message: 'UPDATE_PROFILE 이벤트 처리 완료' });
        break;
      }

      // 계정 삭제 → 로컬 사용자 비활성화
      case 'DELETE_ACCOUNT': {
        const email = details?.email;
        if (email) {
          await prisma.user.updateMany({
            where: { email },
            data: { status: 'inactive' },
          });
          console.log(`[sso-hook] DELETE_ACCOUNT: ${email} 비활성화`);
        }
        res.json({ ok: true, message: 'DELETE_ACCOUNT 이벤트 처리 완료' });
        break;
      }

      default:
        // 미처리 이벤트는 200 OK로 수신만 확인
        res.json({ ok: true, message: `이벤트 수신 (미처리): ${type}` });
    }
  } catch (err) {
    console.error('[sso-hook]', err);
    res.status(500).json({ ok: false, error: 'SSO 훅 처리 중 오류가 발생했습니다.' });
  }
}
