/**
 * auth-service 시드 데이터
 * 실행: npm run db:seed
 * 생성: 기본 조직 + 역할(admin/researcher/viewer) + 관리자 계정
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 시드 데이터 삽입 시작...');

  // 1. 기본 조직 생성 (이미 있으면 건너뜀)
  const org = await prisma.organization.upsert({
    where: { slug: 'default-lab' },
    update: {},
    create: {
      id: 'org-default-001',
      name: '기본 연구소',
      slug: 'default-lab',
    },
  });
  console.log(`✅ 조직: ${org.name} (${org.id})`);

  // 2. 역할 생성
  const adminRole = await prisma.role.upsert({
    where: { id: 'role-admin-001' },
    update: {},
    create: {
      id: 'role-admin-001',
      orgId: org.id,
      name: 'admin',
      permissions: [
        'note:read', 'note:write', 'note:delete', 'note:sign', 'note:unlock',
        'template:read', 'template:write', 'template:delete',
        'inventory:read', 'inventory:write', 'inventory:delete',
        'scheduler:read', 'scheduler:write',
        'user:read', 'user:write', 'user:delete',
        'audit:read', 'export:pdf',
      ],
    },
  });

  const researcherRole = await prisma.role.upsert({
    where: { id: 'role-researcher-001' },
    update: {},
    create: {
      id: 'role-researcher-001',
      orgId: org.id,
      name: 'researcher',
      permissions: [
        'note:read', 'note:write', 'note:sign',
        'template:read', 'template:write',
        'inventory:read', 'inventory:write',
        'scheduler:read', 'scheduler:write',
        'export:pdf',
      ],
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { id: 'role-viewer-001' },
    update: {},
    create: {
      id: 'role-viewer-001',
      orgId: org.id,
      name: 'viewer',
      permissions: [
        'note:read',
        'template:read',
        'inventory:read',
        'scheduler:read',
      ],
    },
  });

  console.log(`✅ 역할: ${adminRole.name}, ${researcherRole.name}, ${viewerRole.name}`);

  // 3. 기본 팀 생성
  const team = await prisma.team.upsert({
    where: { id: 'team-default-001' },
    update: {},
    create: {
      id: 'team-default-001',
      orgId: org.id,
      name: '연구팀 A',
    },
  });
  console.log(`✅ 팀: ${team.name}`);

  // 4. 관리자 계정 생성
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin1234!';
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@labnote.local' },
    update: {},
    create: {
      id: 'user-admin-001',
      orgId: org.id,
      email: 'admin@labnote.local',
      name: '관리자',
      passwordHash: adminHash,
      roleId: adminRole.id,
      status: 'active',
    },
  });
  console.log(`✅ 관리자: ${admin.email} (비밀번호: ${adminPassword})`);

  // 5. 연구원 계정 생성 (개발/테스트용)
  const researcherPassword = 'Researcher1!';
  const researcherHash = await bcrypt.hash(researcherPassword, 10);

  const researcher = await prisma.user.upsert({
    where: { email: 'researcher@labnote.local' },
    update: {},
    create: {
      id: 'user-researcher-001',
      orgId: org.id,
      email: 'researcher@labnote.local',
      name: '연구원',
      passwordHash: researcherHash,
      roleId: researcherRole.id,
      status: 'active',
    },
  });
  console.log(`✅ 연구원: ${researcher.email} (비밀번호: ${researcherPassword})`);

  console.log('\n🎉 시드 데이터 삽입 완료!');
  console.log('─────────────────────────────────────');
  console.log('로그인 계정:');
  console.log(`  관리자:  admin@labnote.local / ${adminPassword}`);
  console.log(`  연구원:  researcher@labnote.local / ${researcherPassword}`);
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ 시드 실패:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
