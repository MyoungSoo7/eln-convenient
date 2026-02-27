import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';

const router = Router();

// 인증
router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', ctrl.getMe);

// 조직
router.get('/orgs', ctrl.getOrgs);
router.post('/orgs', ctrl.createOrg);

// 팀
router.get('/teams', ctrl.getTeams);
router.post('/teams', ctrl.createTeam);

// 사용자
router.get('/users', ctrl.getUsers);
router.post('/users', ctrl.createUser);
router.put('/users/:id', ctrl.updateUser);

// 역할/권한
router.get('/roles', ctrl.getRoles);
router.post('/roles', ctrl.createRole);
router.put('/roles/:id/permissions', ctrl.updatePermissions);

export default router;
