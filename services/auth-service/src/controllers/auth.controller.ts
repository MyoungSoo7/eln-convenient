import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { writeAuditLog } from '../lib/audit';
import { invalidateUserTokens } from '../lib/token-invalidation';
import { AppError, asyncHandler, ErrorCode, createLogger } from '@lab/shared';

const logger = createLogger('auth-service');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. 서버를 시작할 수 없습니다.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

// ─────────────────────────────────────────────
// 인증
// ─────────────────────────────────────────────

/** POST /api/auth/login */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, '이메일 또는 비밀번호가 올바르지 않습니다.', ErrorCode.AUTH_INVALID_CREDENTIALS);
  }
  if (user.status !== 'active') {
    throw new AppError(403, '비활성화된 계정입니다.', ErrorCode.AUTH_INACTIVE_ACCOUNT);
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
});

/** POST /api/auth/refresh — Refresh token으로 새 access token 발급 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: incomingRefresh } = req.body;
  const userId = req.headers['x-user-id'] as string;

  if (!incomingRefresh) {
    throw new AppError(401, 'Refresh token이 필요합니다.', ErrorCode.AUTH_TOKEN_REQUIRED);
  }

  try {
    // Verify the refresh token
    const decoded = jwt.verify(incomingRefresh, JWT_SECRET) as { sub: string; type: string };
    if (decoded.type !== 'refresh') {
      throw new AppError(401, '유효하지 않은 refresh token입니다.', ErrorCode.AUTH_TOKEN_INVALID);
    }

    const targetUserId = userId || decoded.sub;
    if (!targetUserId) {
      throw new AppError(401, '사용자 정보를 확인할 수 없습니다.', ErrorCode.AUTH_TOKEN_INVALID);
    }

    // userId가 있으면 refresh token의 sub와 일치하는지 확인
    if (userId && decoded.sub !== userId) {
      throw new AppError(401, '유효하지 않은 refresh token입니다.', ErrorCode.AUTH_TOKEN_INVALID);
    }

    // 사용자 단위 블랙리스트 확인 (역할/상태 변경 시 refresh도 차단)
    try {
      const invalidatedAt = await redis.get(`blacklist:user:${targetUserId}`);
      if (invalidatedAt) {
        const refreshIat = (decoded as any).iat ?? 0;
        if (refreshIat < Number(invalidatedAt)) {
          throw new AppError(401, '권한이 변경되었습니다. 다시 로그인해주세요.', ErrorCode.AUTH_TOKEN_INVALID);
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Redis 오류는 무시하고 통과
    }

    // Fetch fresh user data
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { role: true },
    });
    if (!user || user.status !== 'active') {
      throw new AppError(401, '비활성화된 계정입니다.', ErrorCode.AUTH_INACTIVE_ACCOUNT);
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
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'Refresh token이 만료되었습니다.', ErrorCode.AUTH_TOKEN_EXPIRED);
  }
});

/** POST /api/auth/register */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, name, password, orgId } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, '이미 사용 중인 이메일입니다.', ErrorCode.AUTH_EMAIL_EXISTS);
  }

  // 기본 조직 확인 (orgId 미제공 시 첫 번째 조직 사용)
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const defaultOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!defaultOrg) {
      throw new AppError(400, '등록 가능한 조직이 없습니다.', ErrorCode.AUTH_NO_ORGANIZATION);
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
});

/** POST /api/auth/logout — Redis 블랙리스트에 토큰 등록 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
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
});

/** GET /api/auth/me */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new AppError(401, '인증 정보가 없습니다.', ErrorCode.UNAUTHORIZED);
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, org: true },
  });
  if (!user) {
    throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
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
});

// ─────────────────────────────────────────────
// 사용자
// ─────────────────────────────────────────────

/** GET /api/auth/users */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.headers['x-user-org-id'] as string | undefined;
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
});

/** POST /api/auth/users (admin) */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, name, password, orgId, roleId } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, '이미 사용 중인 이메일입니다.', ErrorCode.AUTH_EMAIL_EXISTS);
  }

  // orgId 미제공 시 첫 번째 조직으로 자동 연결
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const defaultOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!defaultOrg) {
      throw new AppError(400, '등록 가능한 조직이 없습니다.', ErrorCode.AUTH_NO_ORGANIZATION);
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

  const actorId = req.headers['x-user-id'] as string;
  await writeAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'user_create',
    actorId: actorId || 'system',
    orgId: resolvedOrgId,
    ipAddress: req.ip,
    details: {
      email: user.email,
      name: user.name,
      roleId: user.roleId,
    },
  });

  res.status(201).json({
    ok: true,
    data: {
      id: user.id, orgId: user.orgId, email: user.email, name: user.name,
      roleId: user.roleId, status: user.status, createdAt: user.createdAt.toISOString(),
    },
  });
});

/** PUT /api/auth/users/:id (admin) */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
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
      await writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'role_change',
        actorId,
        orgId: user.orgId,
        ipAddress: req.ip,
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
      await writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'status_change',
        actorId,
        orgId: user.orgId,
        ipAddress: req.ip,
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
      await invalidateUserTokens(req.params.id);
    }

    res.json({
      ok: true,
      data: {
        id: user.id, orgId: user.orgId, email: user.email, name: user.name,
        roleId: user.roleId, status: user.status, updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
    }
    throw err;
  }
});

/** DELETE /api/auth/users/:id (admin) */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const callerId = req.headers['x-user-id'] as string;
  if (req.params.id === callerId) {
    throw new AppError(400, '자기 자신은 삭제할 수 없습니다.', ErrorCode.AUTH_SELF_DELETE);
  }
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true },
    });

    await invalidateUserTokens(req.params.id);
    await prisma.teamMember.deleteMany({ where: { userId: req.params.id } });
    await prisma.user.delete({ where: { id: req.params.id } });

    if (target) {
      await writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'user_delete',
        actorId: callerId,
        orgId: target.orgId,
        ipAddress: req.ip,
        details: {
          deletedEmail: target.email,
          deletedName: target.name,
          deletedRole: target.role?.name ?? null,
        },
      });
    }

    res.json({ ok: true, message: '사용자가 삭제되었습니다.' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
    }
    throw err;
  }
});

// ─────────────────────────────────────────────
// 조직
// ─────────────────────────────────────────────

/** GET /api/auth/orgs */
export const getOrgs = asyncHandler(async (_req: Request, res: Response) => {
  const orgs = await prisma.organization.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({
    ok: true,
    data: orgs.map((o: any) => ({
      id: o.id, name: o.name, slug: o.slug, createdAt: o.createdAt.toISOString(),
    })),
  });
});

/** POST /api/auth/orgs (admin) */
export const createOrg = asyncHandler(async (req: Request, res: Response) => {
  const { name, slug } = req.body;
  try {
    const org = await prisma.organization.create({ data: { id: uuidv4(), name, slug } });

    const actorId = req.headers['x-user-id'] as string;
    writeAuditLog({
      entityType: 'organization',
      entityId: org.id,
      action: 'org_create',
      actorId,
      orgId: org.id,
      ipAddress: req.ip,
      details: { name: org.name, slug: org.slug },
    });

    res.status(201).json({
      ok: true,
      data: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt.toISOString() },
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 사용 중인 slug입니다.', ErrorCode.AUTH_SLUG_EXISTS);
    }
    throw err;
  }
});

/** PUT /api/auth/orgs/:id (admin) */
export const updateOrg = asyncHandler(async (req: Request, res: Response) => {
  const { name, slug } = req.body;
  try {
    const actorId = req.headers['x-user-id'] as string;
    const before = await prisma.organization.findUnique({ where: { id: req.params.id } });

    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
      },
    });

    writeAuditLog({
      entityType: 'organization',
      entityId: org.id,
      action: 'org_update',
      actorId,
      orgId: org.id,
      ipAddress: req.ip,
      details: {
        beforeName: before?.name, afterName: org.name,
        beforeSlug: before?.slug, afterSlug: org.slug,
      },
    });

    res.json({
      ok: true,
      data: { id: org.id, name: org.name, slug: org.slug, updatedAt: org.updatedAt.toISOString() },
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '조직을 찾을 수 없습니다.', ErrorCode.AUTH_ORG_NOT_FOUND);
    }
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 사용 중인 slug입니다.', ErrorCode.AUTH_SLUG_EXISTS);
    }
    throw err;
  }
});

/** DELETE /api/auth/orgs/:id (admin) */
export const deleteOrg = asyncHandler(async (req: Request, res: Response) => {
  try {
    const actorId = req.headers['x-user-id'] as string;
    const target = await prisma.organization.findUnique({ where: { id: req.params.id } });

    const userCount = await prisma.user.count({ where: { orgId: req.params.id } });
    if (userCount > 0) {
      throw new AppError(400, `소속 사용자가 ${userCount}명 있어 삭제할 수 없습니다.`, ErrorCode.AUTH_ORG_HAS_USERS);
    }
    await prisma.organization.delete({ where: { id: req.params.id } });

    if (target) {
      writeAuditLog({
        entityType: 'organization',
        entityId: req.params.id,
        action: 'org_delete',
        actorId,
        orgId: req.params.id,
        ipAddress: req.ip,
        details: { name: target.name, slug: target.slug },
      });
    }

    res.json({ ok: true, message: '조직이 삭제되었습니다.' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '조직을 찾을 수 없습니다.', ErrorCode.AUTH_ORG_NOT_FOUND);
    }
    throw err;
  }
});

// ─────────────────────────────────────────────
// 팀
// ─────────────────────────────────────────────

/** GET /api/auth/teams */
export const getTeams = asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.headers['x-user-org-id'] as string | undefined;
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
});

/** POST /api/auth/teams (admin) */
export const createTeam = asyncHandler(async (req: Request, res: Response) => {
  const { orgId, name } = req.body;
  const team = await prisma.team.create({ data: { id: uuidv4(), orgId, name } });

  const actorId = req.headers['x-user-id'] as string;
  writeAuditLog({
    entityType: 'team',
    entityId: team.id,
    action: 'team_create',
    actorId,
    orgId: team.orgId,
    ipAddress: req.ip,
    details: { name: team.name },
  });

  res.status(201).json({
    ok: true,
    data: { id: team.id, orgId: team.orgId, name: team.name, createdAt: team.createdAt.toISOString() },
  });
});

/** PUT /api/auth/teams/:id (admin) */
export const updateTeam = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  try {
    const actorId = req.headers['x-user-id'] as string;
    const before = await prisma.team.findUnique({ where: { id: req.params.id } });

    const team = await prisma.team.update({
      where: { id: req.params.id },
      data: { name },
    });

    writeAuditLog({
      entityType: 'team',
      entityId: team.id,
      action: 'team_update',
      actorId,
      orgId: team.orgId,
      ipAddress: req.ip,
      details: { beforeName: before?.name, afterName: team.name },
    });

    res.json({
      ok: true,
      data: { id: team.id, orgId: team.orgId, name: team.name, updatedAt: team.updatedAt.toISOString() },
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '팀을 찾을 수 없습니다.', ErrorCode.AUTH_TEAM_NOT_FOUND);
    }
    throw err;
  }
});

/** DELETE /api/auth/teams/:id (admin) */
export const deleteTeam = asyncHandler(async (req: Request, res: Response) => {
  try {
    const actorId = req.headers['x-user-id'] as string;
    const target = await prisma.team.findUnique({ where: { id: req.params.id } });

    await prisma.teamMember.deleteMany({ where: { teamId: req.params.id } });
    await prisma.team.delete({ where: { id: req.params.id } });

    if (target) {
      writeAuditLog({
        entityType: 'team',
        entityId: req.params.id,
        action: 'team_delete',
        actorId,
        orgId: target.orgId,
        ipAddress: req.ip,
        details: { name: target.name },
      });
    }

    res.json({ ok: true, message: '팀이 삭제되었습니다.' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '팀을 찾을 수 없습니다.', ErrorCode.AUTH_TEAM_NOT_FOUND);
    }
    throw err;
  }
});

/** GET /api/auth/teams/:id/members */
export const getTeamMembers = asyncHandler(async (req: Request, res: Response) => {
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
});

/** POST /api/auth/teams/:id/members (admin) */
export const addTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.body;
  try {
    await prisma.teamMember.create({
      data: { userId, teamId: req.params.id },
    });

    const actorId = req.headers['x-user-id'] as string;
    writeAuditLog({
      entityType: 'team',
      entityId: req.params.id,
      action: 'team_member_add',
      actorId,
      orgId: req.headers['x-user-org-id'] as string || '',
      ipAddress: req.ip,
      details: { userId, teamId: req.params.id },
    });

    res.status(201).json({ ok: true, message: '팀에 멤버가 추가되었습니다.' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 팀에 소속된 사용자입니다.', ErrorCode.AUTH_TEAM_MEMBER_EXISTS);
    }
    throw err;
  }
});

/** DELETE /api/auth/teams/:id/members/:userId (admin) */
export const removeTeamMember = asyncHandler(async (req: Request, res: Response) => {
  try {
    await prisma.teamMember.delete({
      where: { userId_teamId: { userId: req.params.userId, teamId: req.params.id } },
    });

    const actorId = req.headers['x-user-id'] as string;
    writeAuditLog({
      entityType: 'team',
      entityId: req.params.id,
      action: 'team_member_remove',
      actorId,
      orgId: req.headers['x-user-org-id'] as string || '',
      ipAddress: req.ip,
      details: { userId: req.params.userId, teamId: req.params.id },
    });

    res.json({ ok: true, message: '팀에서 멤버가 제거되었습니다.' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '해당 팀 멤버를 찾을 수 없습니다.', ErrorCode.AUTH_TEAM_MEMBER_NOT_FOUND);
    }
    throw err;
  }
});

// ─────────────────────────────────────────────
// 역할
// ─────────────────────────────────────────────

/** GET /api/auth/roles */
export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.headers['x-user-org-id'] as string | undefined;
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
});

/** POST /api/auth/roles (admin) */
const ALLOWED_ROLE_NAMES = ['admin', 'researcher', 'reviewer', 'viewer'] as const;

export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const { orgId, name, permissions } = req.body;

  if (!ALLOWED_ROLE_NAMES.includes(name)) {
    throw new AppError(400, `허용되지 않는 역할명입니다. 사용 가능: ${ALLOWED_ROLE_NAMES.join(', ')}`, ErrorCode.AUTH_INVALID_ROLE_NAME);
  }

  const role = await prisma.role.create({
    data: { id: uuidv4(), orgId, name, permissions: permissions || [] },
  });

  const actorId = req.headers['x-user-id'] as string;
  writeAuditLog({
    entityType: 'role',
    entityId: role.id,
    action: 'role_create',
    actorId,
    orgId: role.orgId,
    ipAddress: req.ip,
    details: { name: role.name, permissions: role.permissions },
  });

  res.status(201).json({
    ok: true,
    data: { id: role.id, orgId: role.orgId, name: role.name, permissions: role.permissions },
  });
});

/** PUT /api/auth/roles/:id/permissions (admin) */
export const updatePermissions = asyncHandler(async (req: Request, res: Response) => {
  const { permissions } = req.body;
  const actorId = req.headers['x-user-id'] as string;
  try {
    const before = await prisma.role.findUnique({ where: { id: req.params.id } });

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { permissions },
    });

    if (before) {
      await writeAuditLog({
        entityType: 'role',
        entityId: req.params.id,
        action: 'permission_update',
        actorId,
        orgId: role.orgId,
        ipAddress: req.ip,
        details: {
          roleName: role.name,
          beforePermissions: before.permissions,
          afterPermissions: role.permissions,
        },
      });
    }

    // Redis 역할 권한 캐시 무효화 (api-gateway 캐시)
    // redis.keys() 대신 해당 role의 orgId 목록으로 키를 직접 지정 삭제 (O(N) 블로킹 방지)
    try {
      const orgs = await prisma.organization.findMany({ select: { id: true } });
      const baseKeys = [
        `role-perms:${role.name}`,
        ...orgs.map((o) => `role-perms:${role.name}:${o.id}`),
      ];
      // 정규 캐시 + stale 캐시 모두 삭제
      const cacheKeys = baseKeys.flatMap((k) => [k, `${k}:stale`]);
      await redis.del(...cacheKeys);
    } catch { /* 무시 */ }

    // 해당 역할을 가진 모든 사용자의 토큰 무효화 (권한 즉시 반영)
    try {
      const affectedUsers = await prisma.user.findMany({
        where: { roleId: role.id },
        select: { id: true },
      });
      await Promise.all(affectedUsers.map((u) => invalidateUserTokens(u.id)));
    } catch (invErr) {
      logger.warn({ err: invErr, roleId: role.id }, '역할 권한 변경 후 토큰 무효화 실패');
    }

    res.json({ ok: true, data: { id: role.id, permissions: role.permissions }, message: '권한 수정 완료' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '역할을 찾을 수 없습니다.', ErrorCode.AUTH_ROLE_NOT_FOUND);
    }
    throw err;
  }
});

/** DELETE /api/auth/roles/:id (admin) */
export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  try {
    const actorId = req.headers['x-user-id'] as string;
    const target = await prisma.role.findUnique({ where: { id: req.params.id } });

    const userCount = await prisma.user.count({ where: { roleId: req.params.id } });
    if (userCount > 0) {
      throw new AppError(400, `해당 역할을 가진 사용자가 ${userCount}명 있어 삭제할 수 없습니다.`, ErrorCode.AUTH_ROLE_HAS_USERS);
    }
    await prisma.role.delete({ where: { id: req.params.id } });

    if (target) {
      writeAuditLog({
        entityType: 'role',
        entityId: req.params.id,
        action: 'role_delete',
        actorId,
        orgId: target.orgId,
        ipAddress: req.ip,
        details: { name: target.name, permissions: target.permissions },
      });
    }

    res.json({ ok: true, message: '역할이 삭제되었습니다.' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '역할을 찾을 수 없습니다.', ErrorCode.AUTH_ROLE_NOT_FOUND);
    }
    throw err;
  }
});

// ─────────────────────────────────────────────
// 내부 서비스용 역할 권한 조회
// ─────────────────────────────────────────────

/**
 * GET /api/auth/internal/role-permissions?role=researcher&orgId=xxx
 * 서비스 간 내부 호출 전용 — API Gateway Keycloak 분기에서 역할→권한 매핑 시 사용
 */
export const getRolePermissions = asyncHandler(async (req: Request, res: Response) => {
  // x-internal-secret 검증은 requireInternalSecret 미들웨어에서 처리
  const roleName = req.query.role as string;
  const orgId = req.query.orgId as string | undefined;

  if (!roleName) {
    throw new AppError(400, 'role 파라미터가 필요합니다.', ErrorCode.VALIDATION_ERROR);
  }

  const where: any = { name: roleName };
  if (orgId) where.orgId = orgId;

  const role = await prisma.role.findFirst({ where });
  if (!role) {
    res.json({ ok: true, permissions: [] });
    return;
  }
  res.json({ ok: true, permissions: role.permissions });
});

// ─────────────────────────────────────────────
// 내부 서비스용 비밀번호 검증
// ─────────────────────────────────────────────

/**
 * POST /api/auth/internal/verify-password
 * 서비스 간 내부 호출 전용 — signature-service 등에서 서명 확인 시 사용
 * 헤더: x-internal-secret (환경변수 INTERNAL_SECRET 검증)
 */
export const verifyPassword = asyncHandler(async (req: Request, res: Response) => {
  // x-internal-secret 검증은 requireInternalSecret 미들웨어에서 처리
  const { userId, password } = req.body;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    res.status(200).json({ ok: true, verified: false });
    return;
  }
  const verified = await bcrypt.compare(password, user.passwordHash);
  res.json({ ok: true, verified });
});

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
export const ssoHook = asyncHandler(async (req: Request, res: Response) => {
  const hookSecret = process.env.KEYCLOAK_HOOK_SECRET;
  if (!hookSecret) {
    // KEYCLOAK_HOOK_SECRET 미설정 시 webhook 비활성화 — 404로 응답
    throw new AppError(404, 'Not Found', ErrorCode.NOT_FOUND);
  }
  const incoming = req.headers['x-keycloak-secret'];
  if (incoming !== hookSecret) {
    throw new AppError(401, '유효하지 않은 훅 시크릿입니다.', ErrorCode.INTERNAL_AUTH_FAILED);
  }

  const { type, userId: kcUserId, details } = req.body as {
    type: string;
    userId?: string;
    details?: Record<string, string>;
  };

  switch (type) {
    // 신규 사용자 Keycloak 등록 → 로컬 DB 동기화
    case 'REGISTER': {
      const email = details?.email;
      const username = details?.username ?? email ?? '';
      if (!email) {
        throw new AppError(400, 'REGISTER 이벤트에 email이 없습니다.', ErrorCode.VALIDATION_ERROR);
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

      logger.info(`[sso-hook] REGISTER: ${newUser.email} (${newUser.id})`);
      res.status(201).json({ ok: true, message: 'SSO 사용자 등록 완료', userId: newUser.id });
      break;
    }

    // 로그인 이벤트 — 마지막 로그인 시간 기록 (향후 확장)
    case 'LOGIN': {
      const email = details?.email;
      if (email) {
        logger.info(`[sso-hook] LOGIN: ${email}`);
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
        logger.info(`[sso-hook] UPDATE_PROFILE: ${email} → ${newName}`);
      }
      res.json({ ok: true, message: 'UPDATE_PROFILE 이벤트 처리 완료' });
      break;
    }

    // 계정 삭제 → 로컬 사용자 비활성화 + 토큰 즉시 무효화
    case 'DELETE_ACCOUNT': {
      const email = details?.email;
      if (email) {
        const targets = await prisma.user.findMany({ where: { email }, select: { id: true } });
        await prisma.user.updateMany({
          where: { email },
          data: { status: 'inactive' },
        });
        await Promise.all(targets.map((u) => invalidateUserTokens(u.id)));
        logger.info(`[sso-hook] DELETE_ACCOUNT: ${email} 비활성화 + 토큰 무효화`);
      }
      res.json({ ok: true, message: 'DELETE_ACCOUNT 이벤트 처리 완료' });
      break;
    }

    default:
      // 미처리 이벤트는 200 OK로 수신만 확인
      res.json({ ok: true, message: `이벤트 수신 (미처리): ${type}` });
  }
});
