import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/auth.controller';
import { requireAuth, requireRole, requireInternalSecret } from '../middlewares/auth.middleware';
import { validate, RoleName } from '@lab/shared';
import {
  LoginSchema, RegisterSchema, CreateUserSchema, UpdateUserSchema,
  CreateOrgSchema, UpdateOrgSchema,
  CreateTeamSchema, UpdateTeamSchema, AddTeamMemberSchema,
  CreateRoleSchema, UpdatePermissionsSchema,
  VerifyPasswordSchema, UuidParamsSchema, ChangeMyPasswordSchema,
} from '../dtos/auth.dto';

const authRoutes: FastifyPluginAsync = async (app) => {
  // ─── 공개 (인증 불필요) ───────────────────────────
  app.post('/login', { preHandler: [validate({ body: LoginSchema })] }, ctrl.login);

  // ─── 내부 서비스 전용 (x-internal-secret 필수) ───
  app.post('/internal/verify-password', { preHandler: [requireInternalSecret, validate({ body: VerifyPasswordSchema })] }, ctrl.verifyPassword);
  app.get('/internal/role-permissions', { preHandler: [requireInternalSecret] }, ctrl.getRolePermissions);

  // ─── 토큰 갱신 ──
  app.post('/refresh', ctrl.refreshToken);

  // ─── 이하 모든 라우트: 로그인 필요 ──────────────────
  // Fastify에서는 register로 스코프를 분리하여 addHook 적용
  app.register(async (authed) => {
    authed.addHook('onRequest', requireAuth);

    // 내 정보
    authed.post('/logout', ctrl.logout);
    authed.get('/me', ctrl.getMe);
    authed.patch('/me/password', { preHandler: [validate({ body: ChangeMyPasswordSchema })] }, ctrl.changeMyPassword);

    // 조직
    authed.get('/orgs', ctrl.getOrgs);
    authed.post('/orgs', { preHandler: [requireRole(RoleName.ADMIN), validate({ body: CreateOrgSchema })] }, ctrl.createOrg);
    authed.put('/orgs/:id', { preHandler: [requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: UpdateOrgSchema })] }, ctrl.updateOrg);
    authed.delete('/orgs/:id', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.deleteOrg);

    // 팀
    authed.get('/teams', ctrl.getTeams);
    authed.post('/teams', { preHandler: [requireRole(RoleName.ADMIN), validate({ body: CreateTeamSchema })] }, ctrl.createTeam);
    authed.put('/teams/:id', { preHandler: [requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: UpdateTeamSchema })] }, ctrl.updateTeam);
    authed.delete('/teams/:id', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.deleteTeam);
    authed.get('/teams/:id/members', ctrl.getTeamMembers);
    authed.post('/teams/:id/members', { preHandler: [requireRole(RoleName.ADMIN), validate({ body: AddTeamMemberSchema })] }, ctrl.addTeamMember);
    authed.delete('/teams/:id/members/:userId', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.removeTeamMember);

    // 사용자
    authed.get('/users', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.getUsers);
    authed.post('/register', { preHandler: [requireRole(RoleName.ADMIN), validate({ body: RegisterSchema })] }, ctrl.register);
    authed.post('/users', { preHandler: [requireRole(RoleName.ADMIN), validate({ body: CreateUserSchema })] }, ctrl.createUser);
    authed.put('/users/:id', { preHandler: [requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: UpdateUserSchema })] }, ctrl.updateUser);
    authed.delete('/users/:id', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.deleteUser);
    authed.post('/users/:id/reset-password', { preHandler: [requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema })] }, ctrl.adminResetPassword);

    // 역할
    authed.get('/roles', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.getRoles);
    authed.post('/roles', { preHandler: [requireRole(RoleName.ADMIN), validate({ body: CreateRoleSchema })] }, ctrl.createRole);
    authed.put('/roles/:id/permissions', { preHandler: [requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: UpdatePermissionsSchema })] }, ctrl.updatePermissions);
    authed.delete('/roles/:id', { preHandler: [requireRole(RoleName.ADMIN)] }, ctrl.deleteRole);
  });
};

export default authRoutes;
