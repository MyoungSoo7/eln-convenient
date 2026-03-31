/**
 * auth.controller.ts 단위 테스트 (Prisma/Redis/bcrypt 모킹)
 */

// 환경변수 설정 (모듈 로딩 전)
process.env.JWT_SECRET = 'test-secret-key-must-be-long-enough-for-jwt';
process.env.JWT_EXPIRES_IN = '15m';

// 모킹
jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
    organization: { findMany: jest.fn(), create: jest.fn() },
    role: { findMany: jest.fn(), findFirst: jest.fn() },
    teamMember: { deleteMany: jest.fn() },
  },
}));
jest.mock('../lib/redis', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));
jest.mock('../lib/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../lib/token-invalidation', () => ({ invalidateUserTokens: jest.fn() }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));

import prisma from '../lib/prisma';
import redis from '../lib/redis';
import * as bcrypt from 'bcryptjs';
import { login, refreshToken, getMe } from '../controllers/auth.controller';

const mockReply = () => {
  const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() } as any;
  return reply;
};

describe('auth.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('login', () => {
    const mockUser = {
      id: 'user-1', orgId: 'org-1', email: 'test@test.com',
      name: 'Test', passwordHash: 'hashed', status: 'active',
      roleId: 'role-1', role: { name: 'researcher', permissions: ['note:read', 'note:write'] },
      teamMembers: [{ teamId: 'team-1', teamRole: 'member' }],
      createdAt: new Date(),
    };

    it('로그인 성공 — JWT 토큰 반환', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const req = { body: { email: 'test@test.com', password: 'pass' } } as any;
      const result = await login(req, mockReply());

      expect(result.ok).toBe(true);
      expect(result.data.token).toBeDefined();
      expect(result.data.refreshToken).toBeDefined();
      expect(result.data.user.email).toBe('test@test.com');
      expect(result.data.user.role).toBe('researcher');
    });

    it('존재하지 않는 이메일 → 401', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const req = { body: { email: 'none@test.com', password: 'pass' } } as any;
      await expect(login(req, mockReply())).rejects.toThrow('이메일 또는 비밀번호');
    });

    it('비밀번호 불일치 → 401', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const req = { body: { email: 'test@test.com', password: 'wrong' } } as any;
      await expect(login(req, mockReply())).rejects.toThrow('이메일 또는 비밀번호');
    });

    it('비활성 계정 → 403', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, status: 'inactive' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const req = { body: { email: 'test@test.com', password: 'pass' } } as any;
      await expect(login(req, mockReply())).rejects.toThrow('비활성화');
    });

    it('팀 정보가 JWT에 포함됨', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const req = { body: { email: 'test@test.com', password: 'pass' } } as any;
      const result = await login(req, mockReply());

      // JWT를 디코드하면 teams 배열이 있어야 함
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(result.data.token) as any;
      expect(decoded.teams).toEqual([{ id: 'team-1', role: 'member' }]);
    });
  });

  describe('refreshToken', () => {
    it('refresh token 없으면 → 401', async () => {
      const req = { body: {}, headers: { 'x-user-id': 'user-1' } } as any;
      await expect(refreshToken(req, mockReply())).rejects.toThrow('Refresh token');
    });
  });

  describe('getMe', () => {
    it('현재 사용자 정보 반환', async () => {
      const mockUser = {
        id: 'user-1', email: 'me@test.com', name: 'Me', orgId: 'org-1',
        status: 'active', role: { name: 'admin', permissions: ['*'] },
        teamMembers: [], createdAt: new Date(), updatedAt: new Date(),
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const req = { headers: { 'x-user-id': 'user-1' } } as any;
      const result = await getMe(req, mockReply());

      expect(result.ok).toBe(true);
      expect(result.data.email).toBe('me@test.com');
    });

    it('사용자 미존재 → 에러', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const req = { headers: { 'x-user-id': 'nonexistent' } } as any;
      await expect(getMe(req, mockReply())).rejects.toThrow();
    });
  });
});
