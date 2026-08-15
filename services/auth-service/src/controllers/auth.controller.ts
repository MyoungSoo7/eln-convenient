import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { writeAuditLog } from '../lib/audit';
import { invalidateUserTokens } from '../lib/token-invalidation';
import { AppError, ErrorCode, createLogger, getOrgId } from '@lab/shared';

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
export async function login(request: FastifyRequest, reply: FastifyReply) {
  const { email, password } = request.body as any;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true, teamMembers: { select: { teamId: true, teamRole: true } } },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, '이메일 또는 비밀번호가 올바르지 않습니다.', ErrorCode.AUTH_INVALID_CREDENTIALS);
  }
  if (user.status !== 'active') {
    throw new AppError(403, '비활성화된 계정입니다.', ErrorCode.AUTH_INACTIVE_ACCOUNT);
  }
  const teams = user.teamMembers.map((tm: any) => ({ id: tm.teamId, role: tm.teamRole }));
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role?.name ?? 'viewer',
      permissions: user.role?.permissions ?? [],
      orgId: user.orgId,
      teams,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
  );
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '8h' } as jwt.SignOptions,
  );
  return {
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
  };
}

/** POST /api/auth/refresh — Refresh token으로 새 access token 발급 */
export async function refreshToken(request: FastifyRequest, reply: FastifyReply) {
  const { refreshToken: incomingRefresh } = request.body as any;
  const userId = request.headers['x-user-id'] as string;

  if (!incomingRefresh) {
    throw new AppError(401, 'Refresh token이 필요합니다.', ErrorCode.AUTH_TOKEN_REQUIRED);
  }

  try {
    const decoded = jwt.verify(incomingRefresh, JWT_SECRET) as { sub: string; type: string };
    if (decoded.type !== 'refresh') {
      throw new AppError(401, '유효하지 않은 refresh token입니다.', ErrorCode.AUTH_TOKEN_INVALID);
    }

    const targetUserId = userId || decoded.sub;
    if (!targetUserId) {
      throw new AppError(401, '사용자 정보를 확인할 수 없습니다.', ErrorCode.AUTH_TOKEN_INVALID);
    }

    if (userId && decoded.sub !== userId) {
      throw new AppError(401, '유효하지 않은 refresh token입니다.', ErrorCode.AUTH_TOKEN_INVALID);
    }

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
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { role: true, teamMembers: { select: { teamId: true, teamRole: true } } },
    });
    if (!user || user.status !== 'active') {
      throw new AppError(401, '비활성화된 계정입니다.', ErrorCode.AUTH_INACTIVE_ACCOUNT);
    }

    const teams = user.teamMembers.map((tm: any) => ({ id: tm.teamId, role: tm.teamRole }));
    const newAccessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role?.name ?? 'viewer',
        permissions: user.role?.permissions ?? [],
        orgId: user.orgId,
        teams,
      },
      JWT_SECRET,
      { expiresIn: '15m' } as jwt.SignOptions,
    );

    const newRefreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '8h' } as jwt.SignOptions,
    );

    return {
      ok: true,
      data: { token: newAccessToken, refreshToken: newRefreshToken },
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'Refresh token이 만료되었습니다.', ErrorCode.AUTH_TOKEN_EXPIRED);
  }
}

/** POST /api/auth/register */
export async function register(request: FastifyRequest, reply: FastifyReply) {
  const { email, name, password, orgId } = request.body as any;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, '이미 사용 중인 이메일입니다.', ErrorCode.AUTH_EMAIL_EXISTS);
  }

  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const defaultOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!defaultOrg) {
      throw new AppError(400, '등록 가능한 조직이 없습니다.', ErrorCode.AUTH_NO_ORGANIZATION);
    }
    resolvedOrgId = defaultOrg.id;
  }

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

  reply.code(201);
  return {
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
  };
}

/** POST /api/auth/logout — Redis 블랙리스트에 토큰 등록 */
export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization as string | undefined;
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
  return { ok: true, message: '로그아웃 완료' };
}

/** GET /api/auth/me */
export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.headers['x-user-id'] as string;
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
  return {
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
  };
}

// ─────────────────────────────────────────────
// 사용자
// ─────────────────────────────────────────────

/** GET /api/auth/users */
export async function getUsers(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request.headers);
  const query = request.query as Record<string, string>;
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit) || 50));
  const skip = (page - 1) * limit;

  const where = { orgId };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { role: true, teamMembers: { include: { team: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    ok: true,
    data: users.map((u: any) => ({
      id: u.id, orgId: u.orgId, email: u.email, name: u.name,
      roleId: u.roleId, role: u.role?.name, status: u.status,
      team: u.teamMembers[0]?.team?.name ?? null,
      teamId: u.teamMembers[0]?.team?.id ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  };
}

/** POST /api/auth/users (admin) */
export async function createUser(request: FastifyRequest, reply: FastifyReply) {
  const { email, name, password, orgId, roleId } = request.body as any;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, '이미 사용 중인 이메일입니다.', ErrorCode.AUTH_EMAIL_EXISTS);
  }

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

  const actorId = request.headers['x-user-id'] as string;
  await writeAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'user_create',
    actorId: actorId || 'system',
    orgId: resolvedOrgId,
    ipAddress: request.ip,
    details: {
      email: user.email,
      name: user.name,
      roleId: user.roleId,
    },
  });

  reply.code(201);
  return {
    ok: true,
    data: {
      id: user.id, orgId: user.orgId, email: user.email, name: user.name,
      roleId: user.roleId, status: user.status, createdAt: user.createdAt.toISOString(),
    },
  };
}

/** PUT /api/auth/users/:id (admin) */
export async function updateUser(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { name, roleId, status } = request.body as any;
  const actorId = request.headers['x-user-id'] as string;
  const orgId = getOrgId(request.headers);
  try {
    const before = await prisma.user.findFirst({
      where: { id, orgId },
      include: { role: true },
    });
    if (!before) {
      throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(roleId !== undefined && { roleId }),
        ...(status !== undefined && { status }),
      },
      include: { role: true },
    });

    if (roleId !== undefined && before && before.roleId !== roleId) {
      await writeAuditLog({
        entityType: 'user',
        entityId: id,
        action: 'role_change',
        actorId,
        orgId: user.orgId,
        ipAddress: request.ip,
        details: {
          beforeRole: before.role?.name ?? null,
          beforeRoleId: before.roleId,
          afterRole: user.role?.name ?? null,
          afterRoleId: user.roleId,
          userEmail: user.email,
        },
      });
    }

    if (status !== undefined && before && before.status !== status) {
      await writeAuditLog({
        entityType: 'user',
        entityId: id,
        action: 'status_change',
        actorId,
        orgId: user.orgId,
        ipAddress: request.ip,
        details: {
          beforeStatus: before.status,
          afterStatus: status,
          userEmail: user.email,
        },
      });
    }

    const roleChanged = roleId !== undefined && before && before.roleId !== roleId;
    const statusChanged = status !== undefined && before && before.status !== status;
    if (roleChanged || statusChanged) {
      await invalidateUserTokens(id);
    }

    return {
      ok: true,
      data: {
        id: user.id, orgId: user.orgId, email: user.email, name: user.name,
        roleId: user.roleId, status: user.status, updatedAt: user.updatedAt.toISOString(),
      },
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
    }
    throw err;
  }
}

/** DELETE /api/auth/users/:id (admin) */
export async function deleteUser(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const callerId = request.headers['x-user-id'] as string;
  const orgId = getOrgId(request.headers);
  if (id === callerId) {
    throw new AppError(400, '자기 자신은 삭제할 수 없습니다.', ErrorCode.AUTH_SELF_DELETE);
  }
  try {
    const target = await prisma.user.findFirst({
      where: { id, orgId },
      include: { role: true },
    });
    if (!target) {
      throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
    }

    await invalidateUserTokens(id);
    await prisma.teamMember.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    if (target) {
      await writeAuditLog({
        entityType: 'user',
        entityId: id,
        action: 'user_delete',
        actorId: callerId,
        orgId: target.orgId,
        ipAddress: request.ip,
        details: {
          deletedEmail: target.email,
          deletedName: target.name,
          deletedRole: target.role?.name ?? null,
        },
      });
    }

    return { ok: true, message: '사용자가 삭제되었습니다.' };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
// 조직
// ─────────────────────────────────────────────

/** GET /api/auth/orgs */
export async function getOrgs(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request.headers);
  const userRole = request.headers['x-user-role'] as string;

  // admin은 전체 조직 조회 가능, 일반 사용자는 자기 조직만
  const where = userRole === 'admin' ? {} : { id: orgId };
  const orgs = await prisma.organization.findMany({ where, orderBy: { createdAt: 'asc' } });
  return {
    ok: true,
    data: orgs.map((o: any) => ({
      id: o.id, name: o.name, slug: o.slug, createdAt: o.createdAt.toISOString(),
    })),
  };
}

/** POST /api/auth/orgs (admin) */
export async function createOrg(request: FastifyRequest, reply: FastifyReply) {
  const { name, slug } = request.body as any;
  try {
    const org = await prisma.organization.create({ data: { id: uuidv4(), name, slug } });

    const actorId = request.headers['x-user-id'] as string;
    writeAuditLog({
      entityType: 'organization',
      entityId: org.id,
      action: 'org_create',
      actorId,
      orgId: org.id,
      ipAddress: request.ip,
      details: { name: org.name, slug: org.slug },
    });

    reply.code(201);
    return {
      ok: true,
      data: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt.toISOString() },
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 사용 중인 slug입니다.', ErrorCode.AUTH_SLUG_EXISTS);
    }
    throw err;
  }
}

/** PUT /api/auth/orgs/:id (admin) */
export async function updateOrg(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { name, slug } = request.body as any;
  try {
    const actorId = request.headers['x-user-id'] as string;
    const before = await prisma.organization.findUnique({ where: { id } });

    const org = await prisma.organization.update({
      where: { id },
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
      ipAddress: request.ip,
      details: {
        beforeName: before?.name, afterName: org.name,
        beforeSlug: before?.slug, afterSlug: org.slug,
      },
    });

    return {
      ok: true,
      data: { id: org.id, name: org.name, slug: org.slug, updatedAt: org.updatedAt.toISOString() },
    };
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
}

/** DELETE /api/auth/orgs/:id (admin) */
export async function deleteOrg(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const actorId = request.headers['x-user-id'] as string;
    const target = await prisma.organization.findUnique({ where: { id } });

    const userCount = await prisma.user.count({ where: { orgId: id } });
    if (userCount > 0) {
      throw new AppError(400, `소속 사용자가 ${userCount}명 있어 삭제할 수 없습니다.`, ErrorCode.AUTH_ORG_HAS_USERS);
    }
    await prisma.organization.delete({ where: { id } });

    if (target) {
      writeAuditLog({
        entityType: 'organization',
        entityId: id,
        action: 'org_delete',
        actorId,
        orgId: id,
        ipAddress: request.ip,
        details: { name: target.name, slug: target.slug },
      });
    }

    return { ok: true, message: '조직이 삭제되었습니다.' };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '조직을 찾을 수 없습니다.', ErrorCode.AUTH_ORG_NOT_FOUND);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
// 팀
// ─────────────────────────────────────────────

/** GET /api/auth/teams?orgId=xxx */
export async function getTeams(request: FastifyRequest, reply: FastifyReply) {
  const userOrgId = getOrgId(request.headers);
  const userRole = request.headers['x-user-role'] as string;
  const query = request.query as Record<string, string>;

  // admin: orgId 파라미터 없으면 전체 조직 팀 조회, 있으면 해당 조직만
  // 일반 사용자: 자신의 조직만
  const where = userRole === 'admin'
    ? (query.orgId ? { orgId: query.orgId } : {})
    : { orgId: userOrgId };

  const teams = await prisma.team.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { members: true } } },
  });
  return {
    ok: true,
    data: teams.map((t: any) => ({
      id: t.id, orgId: t.orgId, name: t.name,
      memberCount: t._count.members,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/** POST /api/auth/teams (admin) */
export async function createTeam(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, name } = request.body as any;
  const team = await prisma.team.create({ data: { id: uuidv4(), orgId, name } });

  const actorId = request.headers['x-user-id'] as string;
  writeAuditLog({
    entityType: 'team',
    entityId: team.id,
    action: 'team_create',
    actorId,
    orgId: team.orgId,
    ipAddress: request.ip,
    details: { name: team.name },
  });

  reply.code(201);
  return {
    ok: true,
    data: { id: team.id, orgId: team.orgId, name: team.name, createdAt: team.createdAt.toISOString() },
  };
}

/** PUT /api/auth/teams/:id (admin) */
export async function updateTeam(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { name } = request.body as any;
  try {
    const actorId = request.headers['x-user-id'] as string;
    const before = await prisma.team.findUnique({ where: { id } });

    const team = await prisma.team.update({
      where: { id },
      data: { name },
    });

    writeAuditLog({
      entityType: 'team',
      entityId: team.id,
      action: 'team_update',
      actorId,
      orgId: team.orgId,
      ipAddress: request.ip,
      details: { beforeName: before?.name, afterName: team.name },
    });

    return {
      ok: true,
      data: { id: team.id, orgId: team.orgId, name: team.name, updatedAt: team.updatedAt.toISOString() },
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '팀을 찾을 수 없습니다.', ErrorCode.AUTH_TEAM_NOT_FOUND);
    }
    throw err;
  }
}

/** DELETE /api/auth/teams/:id (admin) */
export async function deleteTeam(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const actorId = request.headers['x-user-id'] as string;
    const target = await prisma.team.findUnique({ where: { id } });

    const memberCount = await prisma.teamMember.count({ where: { teamId: id } });
    if (memberCount > 0) {
      throw new AppError(400, `팀에 소속된 멤버(${memberCount}명)가 있어 삭제할 수 없습니다. 먼저 멤버를 제거해 주세요.`, ErrorCode.AUTH_TEAM_HAS_MEMBERS);
    }

    await prisma.team.delete({ where: { id } });

    if (target) {
      writeAuditLog({
        entityType: 'team',
        entityId: id,
        action: 'team_delete',
        actorId,
        orgId: target.orgId,
        ipAddress: request.ip,
        details: { name: target.name },
      });
    }

    return { ok: true, message: '팀이 삭제되었습니다.' };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '팀을 찾을 수 없습니다.', ErrorCode.AUTH_TEAM_NOT_FOUND);
    }
    throw err;
  }
}

/** GET /api/auth/teams/:id/members */
export async function getTeamMembers(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const members = await prisma.teamMember.findMany({
    where: { teamId: id },
    include: { user: { include: { role: true } } },
  });
  return {
    ok: true,
    data: members.map((m: any) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.user.role?.name,
      status: m.user.status,
    })),
  };
}

/** POST /api/auth/teams/:id/members (admin) */
export async function addTeamMember(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { userId, teamRole } = request.body as any;
  try {
    await prisma.teamMember.create({
      data: { userId, teamId: id, teamRole: teamRole || 'member' },
    });

    const actorId = request.headers['x-user-id'] as string;
    writeAuditLog({
      entityType: 'team',
      entityId: id,
      action: 'team_member_add',
      actorId,
      orgId: request.headers['x-user-org-id'] as string || '',
      ipAddress: request.ip,
      details: { userId, teamId: id },
    });

    reply.code(201);
    return { ok: true, message: '팀에 멤버가 추가되었습니다.' };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2002') {
      throw new AppError(409, '이미 팀에 소속된 사용자입니다.', ErrorCode.AUTH_TEAM_MEMBER_EXISTS);
    }
    throw err;
  }
}

/** DELETE /api/auth/teams/:id/members/:userId (admin) */
export async function removeTeamMember(request: FastifyRequest, reply: FastifyReply) {
  const { id, userId } = request.params as { id: string; userId: string };
  try {
    await prisma.teamMember.delete({
      where: { userId_teamId: { userId, teamId: id } },
    });

    const actorId = request.headers['x-user-id'] as string;
    writeAuditLog({
      entityType: 'team',
      entityId: id,
      action: 'team_member_remove',
      actorId,
      orgId: request.headers['x-user-org-id'] as string || '',
      ipAddress: request.ip,
      details: { userId, teamId: id },
    });

    return { ok: true, message: '팀에서 멤버가 제거되었습니다.' };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '해당 팀 멤버를 찾을 수 없습니다.', ErrorCode.AUTH_TEAM_MEMBER_NOT_FOUND);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
// 역할
// ─────────────────────────────────────────────

/** GET /api/auth/roles */
export async function getRoles(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.headers['x-user-org-id'] as string | undefined;
  const roles = await prisma.role.findMany({
    where: orgId ? { orgId } : undefined,
    include: { _count: { select: { users: true } } },
  });
  return {
    ok: true,
    data: roles.map((r: any) => ({
      id: r.id, orgId: r.orgId, name: r.name, permissions: r.permissions,
      userCount: r._count.users,
    })),
  };
}

/** POST /api/auth/roles (admin) */
const ALLOWED_ROLE_NAMES = ['admin', 'researcher', 'reviewer', 'viewer'] as const;

export async function createRole(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, name, permissions } = request.body as any;

  if (!ALLOWED_ROLE_NAMES.includes(name)) {
    throw new AppError(400, `허용되지 않는 역할명입니다. 사용 가능: ${ALLOWED_ROLE_NAMES.join(', ')}`, ErrorCode.AUTH_INVALID_ROLE_NAME);
  }

  const role = await prisma.role.create({
    data: { id: uuidv4(), orgId, name, permissions: permissions || [] },
  });

  const actorId = request.headers['x-user-id'] as string;
  writeAuditLog({
    entityType: 'role',
    entityId: role.id,
    action: 'role_create',
    actorId,
    orgId: role.orgId,
    ipAddress: request.ip,
    details: { name: role.name, permissions: role.permissions },
  });

  reply.code(201);
  return {
    ok: true,
    data: { id: role.id, orgId: role.orgId, name: role.name, permissions: role.permissions },
  };
}

/** PUT /api/auth/roles/:id/permissions (admin) */
export async function updatePermissions(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { permissions } = request.body as any;
  const actorId = request.headers['x-user-id'] as string;
  try {
    const before = await prisma.role.findUnique({ where: { id } });

    const role = await prisma.role.update({
      where: { id },
      data: { permissions },
    });

    if (before) {
      await writeAuditLog({
        entityType: 'role',
        entityId: id,
        action: 'permission_update',
        actorId,
        orgId: role.orgId,
        ipAddress: request.ip,
        details: {
          roleName: role.name,
          beforePermissions: before.permissions,
          afterPermissions: role.permissions,
        },
      });
    }

    try {
      const orgs = await prisma.organization.findMany({ select: { id: true } });
      const baseKeys = [
        `role-perms:${role.name}`,
        ...orgs.map((o) => `role-perms:${role.name}:${o.id}`),
      ];
      const cacheKeys = baseKeys.flatMap((k) => [k, `${k}:stale`]);
      await redis.del(...cacheKeys);
    } catch { /* 무시 */ }

    try {
      const affectedUsers = await prisma.user.findMany({
        where: { roleId: role.id },
        select: { id: true },
      });
      await Promise.all(affectedUsers.map((u) => invalidateUserTokens(u.id)));
    } catch (invErr) {
      logger.warn({ err: invErr, roleId: role.id }, '역할 권한 변경 후 토큰 무효화 실패');
    }

    return { ok: true, data: { id: role.id, permissions: role.permissions }, message: '권한 수정 완료' };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '역할을 찾을 수 없습니다.', ErrorCode.AUTH_ROLE_NOT_FOUND);
    }
    throw err;
  }
}

/** DELETE /api/auth/roles/:id (admin) */
export async function deleteRole(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const actorId = request.headers['x-user-id'] as string;
    const target = await prisma.role.findUnique({ where: { id } });

    const userCount = await prisma.user.count({ where: { roleId: id } });
    if (userCount > 0) {
      throw new AppError(400, `해당 역할을 가진 사용자가 ${userCount}명 있어 삭제할 수 없습니다.`, ErrorCode.AUTH_ROLE_HAS_USERS);
    }
    await prisma.role.delete({ where: { id } });

    if (target) {
      writeAuditLog({
        entityType: 'role',
        entityId: id,
        action: 'role_delete',
        actorId,
        orgId: target.orgId,
        ipAddress: request.ip,
        details: { name: target.name, permissions: target.permissions },
      });
    }

    return { ok: true, message: '역할이 삭제되었습니다.' };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === 'P2025') {
      throw new AppError(404, '역할을 찾을 수 없습니다.', ErrorCode.AUTH_ROLE_NOT_FOUND);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
// 내부 서비스용 역할 권한 조회
// ─────────────────────────────────────────────

export async function getRolePermissions(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Record<string, string>;
  const roleName = query.role;
  const orgId = query.orgId;

  if (!roleName) {
    throw new AppError(400, 'role 파라미터가 필요합니다.', ErrorCode.VALIDATION_ERROR);
  }

  const where: any = { name: roleName };
  if (orgId) where.orgId = orgId;

  const role = await prisma.role.findFirst({ where });
  if (!role) {
    return { ok: true, permissions: [] };
  }
  return { ok: true, permissions: role.permissions };
}

// ─────────────────────────────────────────────
// 비밀번호 변경 / 초기화
// ─────────────────────────────────────────────

/** PATCH /api/auth/me/password — 본인 비밀번호 변경 */
export async function changeMyPassword(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.headers['x-user-id'] as string;
  const { currentPassword, newPassword } = request.body as any;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError(401, '현재 비밀번호가 올바르지 않습니다.', ErrorCode.AUTH_INVALID_CREDENTIALS);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  await writeAuditLog({
    entityType: 'user',
    entityId: userId,
    action: 'password_changed',
    actorId: userId,
    orgId: user.orgId,
    ipAddress: request.ip,
    details: { method: 'self' },
  });

  logger.info({ userId }, '비밀번호 변경 완료 (본인)');
  return { ok: true, data: { message: '비밀번호가 변경되었습니다.' } };
}

/** POST /api/auth/users/:id/reset-password — 관리자가 사용자 비밀번호 초기화 */
export async function adminResetPassword(request: FastifyRequest, reply: FastifyReply) {
  const { id: targetUserId } = request.params as { id: string };
  const adminId = request.headers['x-user-id'] as string;
  const orgId = getOrgId(request.headers);

  // 형제 라우트인 updateUser / deleteUser 는 둘 다 findFirst({ id, orgId }) 로
  // 조직을 좁힌다. 이 라우트만 findUnique({ id }) 였다 — requireRole(ADMIN) 은
  // '관리자인가' 만 보고 '어느 조직 관리자인가' 는 안 보므로, A 조직 관리자가
  // B 조직 사용자의 비밀번호를 초기화하고 그 계정으로 로그인할 수 있었다.
  const user = await prisma.user.findFirst({ where: { id: targetUserId, orgId } });
  if (!user) {
    throw new AppError(404, '사용자를 찾을 수 없습니다.', ErrorCode.AUTH_USER_NOT_FOUND);
  }

  // 기본값을 코드에 박아 두면 환경변수를 안 넣은 배포에서 초기화 비밀번호가
  // 공개 상수가 된다. 이 브랜치는 2ac32fa 에서 이미 그 방향을 정리했다.
  const defaultPassword = process.env.DEFAULT_RESET_PASSWORD;
  if (!defaultPassword) {
    throw new AppError(500, '비밀번호 초기화 기본값이 설정되지 않았습니다.', ErrorCode.INTERNAL_ERROR);
  }
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  await prisma.user.update({ where: { id: targetUserId }, data: { passwordHash } });

  await writeAuditLog({
    entityType: 'user',
    entityId: targetUserId,
    action: 'password_reset_by_admin',
    actorId: adminId,
    orgId: user.orgId,
    ipAddress: request.ip,
    details: { targetEmail: user.email, targetName: user.name },
  });

  logger.info({ adminId, targetUserId }, '비밀번호 초기화 완료 (관리자)');
  return { ok: true, data: { message: '비밀번호가 초기화되었습니다.' } };
}

// ─────────────────────────────────────────────
// 내부 서비스용 비밀번호 검증
// ─────────────────────────────────────────────

export async function verifyPassword(request: FastifyRequest, reply: FastifyReply) {
  const { userId, password } = request.body as any;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    return { ok: true, verified: false };
  }
  const verified = await bcrypt.compare(password, user.passwordHash);
  return { ok: true, verified };
}

