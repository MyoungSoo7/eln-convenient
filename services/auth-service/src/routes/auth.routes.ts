import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { validate, RoleName } from '@lab/shared';
import {
  LoginSchema, RegisterSchema, CreateUserSchema, UpdateUserSchema,
  CreateOrgSchema, UpdateOrgSchema,
  CreateTeamSchema, UpdateTeamSchema, AddTeamMemberSchema,
  CreateRoleSchema, UpdatePermissionsSchema,
  VerifyPasswordSchema, SsoHookSchema, UuidParamsSchema,
} from '../dtos/auth.dto';

const router = Router();

// ─── 공개 (인증 불필요) ───────────────────────────
router.post('/login', validate({ body: LoginSchema }), ctrl.login);
router.post('/register', validate({ body: RegisterSchema }), ctrl.register);

// ─── 내부 서비스 전용 ────────────────────────────
router.post('/internal/verify-password', validate({ body: VerifyPasswordSchema }), ctrl.verifyPassword);
router.get('/internal/role-permissions', ctrl.getRolePermissions);

// ─── SSO 훅 (Keycloak → auth-service, 시크릿으로 보호) ───
router.post('/sso-hook', validate({ body: SsoHookSchema }), ctrl.ssoHook);

// ─── 이하 모든 라우트: 로그인 필요 ──────────────────
router.use(requireAuth);

// 내 정보
router.post('/logout', ctrl.logout);
router.get('/me', ctrl.getMe);

// 조직 (읽기: 인증만, 쓰기/삭제: admin)
router.get('/orgs', ctrl.getOrgs);
router.post('/orgs', requireRole(RoleName.ADMIN), validate({ body: CreateOrgSchema }), ctrl.createOrg);
router.put('/orgs/:id', requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: UpdateOrgSchema }), ctrl.updateOrg);
router.delete('/orgs/:id', requireRole(RoleName.ADMIN), ctrl.deleteOrg);

// 팀 (읽기: 인증만, 쓰기/삭제: admin)
router.get('/teams', ctrl.getTeams);
router.post('/teams', requireRole(RoleName.ADMIN), validate({ body: CreateTeamSchema }), ctrl.createTeam);
router.put('/teams/:id', requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: UpdateTeamSchema }), ctrl.updateTeam);
router.delete('/teams/:id', requireRole(RoleName.ADMIN), ctrl.deleteTeam);
router.get('/teams/:id/members', ctrl.getTeamMembers);
router.post('/teams/:id/members', requireRole(RoleName.ADMIN), validate({ body: AddTeamMemberSchema }), ctrl.addTeamMember);
router.delete('/teams/:id/members/:userId', requireRole(RoleName.ADMIN), ctrl.removeTeamMember);

// 사용자 (읽기: admin, 쓰기/삭제: admin)
router.get('/users', requireRole(RoleName.ADMIN), ctrl.getUsers);
router.post('/users', requireRole(RoleName.ADMIN), validate({ body: CreateUserSchema }), ctrl.createUser);
router.put('/users/:id', requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: UpdateUserSchema }), ctrl.updateUser);
router.delete('/users/:id', requireRole(RoleName.ADMIN), ctrl.deleteUser);

// 역할 (읽기: admin, 쓰기/삭제: admin)
router.get('/roles', requireRole(RoleName.ADMIN), ctrl.getRoles);
router.post('/roles', requireRole(RoleName.ADMIN), validate({ body: CreateRoleSchema }), ctrl.createRole);
router.put('/roles/:id/permissions', requireRole(RoleName.ADMIN), validate({ params: UuidParamsSchema, body: UpdatePermissionsSchema }), ctrl.updatePermissions);
router.delete('/roles/:id', requireRole(RoleName.ADMIN), ctrl.deleteRole);

export default router;
