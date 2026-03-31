import { Permission, RoleName, RolePermissions } from '../permissions';

describe('Permissions', () => {
  it('모든 권한 상수가 정의되어 있다', () => {
    expect(Permission.NOTE_READ).toBe('note:read');
    expect(Permission.NOTE_WRITE).toBe('note:write');
    expect(Permission.NOTE_SIGN).toBe('note:sign');
    expect(Permission.NOTE_UNLOCK).toBe('note:unlock');
    expect(Permission.FILE_UPLOAD).toBe('file:upload');
    expect(Permission.AUDIT_READ).toBe('audit:read');
  });

  it('모든 역할이 정의되어 있다', () => {
    expect(RoleName.ADMIN).toBe('admin');
    expect(RoleName.RESEARCHER).toBe('researcher');
    expect(RoleName.REVIEWER).toBe('reviewer');
    expect(RoleName.VIEWER).toBe('viewer');
  });

  it('admin은 와일드카드 권한을 가진다', () => {
    expect(RolePermissions[RoleName.ADMIN]).toContain('*');
  });

  it('researcher는 note:sign 권한이 없다 (서명 불가)', () => {
    expect(RolePermissions[RoleName.RESEARCHER]).not.toContain(Permission.NOTE_SIGN);
  });

  it('researcher는 note:write 권한이 있다', () => {
    expect(RolePermissions[RoleName.RESEARCHER]).toContain(Permission.NOTE_WRITE);
  });

  it('reviewer는 note:sign 권한이 있다 (서명 가능)', () => {
    expect(RolePermissions[RoleName.REVIEWER]).toContain(Permission.NOTE_SIGN);
  });

  it('reviewer는 note:write 권한이 없다 (수정 불가)', () => {
    expect(RolePermissions[RoleName.REVIEWER]).not.toContain(Permission.NOTE_WRITE);
  });

  it('viewer는 읽기 전용이다', () => {
    const viewerPerms = RolePermissions[RoleName.VIEWER];
    expect(viewerPerms.every(p => p.endsWith(':read'))).toBe(true);
  });

  it('모든 역할에 권한 배열이 존재한다', () => {
    Object.values(RoleName).forEach(role => {
      expect(RolePermissions[role]).toBeDefined();
      expect(Array.isArray(RolePermissions[role])).toBe(true);
      expect(RolePermissions[role].length).toBeGreaterThan(0);
    });
  });
});
