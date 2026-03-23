import { z } from 'zod';

// ─── 공통 ────────────────────────────────────────
export const UuidParamsSchema = z.object({
  id: z.string().uuid(),
});

// ─── 인증 ────────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().min(1, '이메일과 비밀번호를 입력해주세요.'),
  password: z.string().min(1, '이메일과 비밀번호를 입력해주세요.'),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  name: z.string().min(1, 'email, name, password는 필수입니다.'),
  email: z.string().min(1, 'email, name, password는 필수입니다.'),
  password: z.string().min(1, 'email, name, password는 필수입니다.'),
  orgId: z.string().optional(),
  teamId: z.string().optional(),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

// ─── 사용자 ──────────────────────────────────────
export const CreateUserSchema = z.object({
  email: z.string().min(1, 'email, name, password는 필수입니다.'),
  name: z.string().min(1, 'email, name, password는 필수입니다.'),
  password: z.string().min(1, 'email, name, password는 필수입니다.'),
  orgId: z.string().optional(),
  roleId: z.string().optional(),
});
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  roleId: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

// ─── 조직 ────────────────────────────────────────
export const CreateOrgSchema = z.object({
  name: z.string().min(1, 'name과 slug는 필수입니다.'),
  slug: z.string().min(1, 'name과 slug는 필수입니다.'),
});
export type CreateOrgDto = z.infer<typeof CreateOrgSchema>;

export const UpdateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
});
export type UpdateOrgDto = z.infer<typeof UpdateOrgSchema>;

// ─── 팀 ──────────────────────────────────────────
export const CreateTeamSchema = z.object({
  orgId: z.string().min(1, 'orgId와 name은 필수입니다.'),
  name: z.string().min(1, 'orgId와 name은 필수입니다.'),
});
export type CreateTeamDto = z.infer<typeof CreateTeamSchema>;

export const UpdateTeamSchema = z.object({
  name: z.string().min(1, 'name은 필수입니다.'),
});
export type UpdateTeamDto = z.infer<typeof UpdateTeamSchema>;

export const AddTeamMemberSchema = z.object({
  userId: z.string().min(1, 'userId는 필수입니다.'),
});
export type AddTeamMemberDto = z.infer<typeof AddTeamMemberSchema>;

// ─── 역할 ────────────────────────────────────────
export const CreateRoleSchema = z.object({
  orgId: z.string().min(1, 'orgId와 name은 필수입니다.'),
  name: z.string().min(1, 'orgId와 name은 필수입니다.'),
  permissions: z.array(z.string()).default([]),
});
export type CreateRoleDto = z.infer<typeof CreateRoleSchema>;

export const UpdatePermissionsSchema = z.object({
  permissions: z.array(z.string(), { message: 'permissions는 배열이어야 합니다.' }),
});
export type UpdatePermissionsDto = z.infer<typeof UpdatePermissionsSchema>;

// ─── 내부 서비스 ─────────────────────────────────
export const VerifyPasswordSchema = z.object({
  userId: z.string().min(1, 'userId와 password는 필수입니다.'),
  password: z.string().min(1, 'userId와 password는 필수입니다.'),
});
export type VerifyPasswordDto = z.infer<typeof VerifyPasswordSchema>;

