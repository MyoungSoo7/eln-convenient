import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// ─── 공개 (인증 불필요) ───────────────────────────
router.post('/login', ctrl.login);
router.post('/register', ctrl.register);

// ─── 내부 서비스 전용 ────────────────────────────
router.post('/internal/verify-password', ctrl.verifyPassword);

// ─── SSO 훅 (Keycloak → auth-service, 시크릿으로 보호) ───
router.post('/sso-hook', ctrl.ssoHook);

// ─── 이하 모든 라우트: 로그인 필요 ──────────────────
router.use(requireAuth);

// 내 정보
router.post('/logout', ctrl.logout);
router.get('/me', ctrl.getMe);

// 조직 (읽기: 인증만, 쓰기/삭제: admin)
router.get('/orgs', ctrl.getOrgs);
router.post('/orgs', requireRole('admin'), ctrl.createOrg);
router.put('/orgs/:id', requireRole('admin'), ctrl.updateOrg);
router.delete('/orgs/:id', requireRole('admin'), ctrl.deleteOrg);

// 팀 (읽기: 인증만, 쓰기/삭제: admin)
router.get('/teams', ctrl.getTeams);
router.post('/teams', requireRole('admin'), ctrl.createTeam);
router.put('/teams/:id', requireRole('admin'), ctrl.updateTeam);
router.delete('/teams/:id', requireRole('admin'), ctrl.deleteTeam);
router.get('/teams/:id/members', ctrl.getTeamMembers);
router.post('/teams/:id/members', requireRole('admin'), ctrl.addTeamMember);
router.delete('/teams/:id/members/:userId', requireRole('admin'), ctrl.removeTeamMember);

// 사용자 (읽기: admin, 쓰기/삭제: admin)
router.get('/users', requireRole('admin'), ctrl.getUsers);
router.post('/users', requireRole('admin'), ctrl.createUser);
router.put('/users/:id', requireRole('admin'), ctrl.updateUser);
router.delete('/users/:id', requireRole('admin'), ctrl.deleteUser);

// 역할 (읽기: admin, 쓰기/삭제: admin)
router.get('/roles', requireRole('admin'), ctrl.getRoles);
router.post('/roles', requireRole('admin'), ctrl.createRole);
router.put('/roles/:id/permissions', requireRole('admin'), ctrl.updatePermissions);
router.delete('/roles/:id', requireRole('admin'), ctrl.deleteRole);

export default router;
