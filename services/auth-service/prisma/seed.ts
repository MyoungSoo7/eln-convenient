/**
 * auth-service 시드 데이터
 * 실행: npm run db:seed
 * 생성: 기본 조직 + 역할(admin/researcher/viewer) + 관리자 계정
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { RolePermissions } from '@lab/shared';

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
    update: { permissions: [...RolePermissions.admin] },
    create: {
      id: 'role-admin-001',
      orgId: org.id,
      name: 'admin',
      permissions: [...RolePermissions.admin],
    },
  });

  const researcherRole = await prisma.role.upsert({
    where: { id: 'role-researcher-001' },
    update: { permissions: [...RolePermissions.researcher] },
    create: {
      id: 'role-researcher-001',
      orgId: org.id,
      name: 'researcher',
      permissions: [...RolePermissions.researcher],
    },
  });

  const reviewerRole = await prisma.role.upsert({
    where: { id: 'role-reviewer-001' },
    update: { permissions: [...RolePermissions.reviewer] },
    create: {
      id: 'role-reviewer-001',
      orgId: org.id,
      name: 'reviewer',
      permissions: [...RolePermissions.reviewer],
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { id: 'role-viewer-001' },
    update: { permissions: [...RolePermissions.viewer] },
    create: {
      id: 'role-viewer-001',
      orgId: org.id,
      name: 'viewer',
      permissions: [...RolePermissions.viewer],
    },
  });

  console.log(`✅ 역할: ${adminRole.name}, ${researcherRole.name}, ${reviewerRole.name}, ${viewerRole.name}`);

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
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_INITIAL_PASSWORD 환경변수를 설정하세요. 예: ADMIN_INITIAL_PASSWORD=MyStr0ng!Pass npm run db:seed');
  }
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
  console.log(`✅ 관리자: ${admin.email}`);

  // 5. 연구원 계정 생성 (개발/테스트용)
  const researcherPassword = process.env.RESEARCHER_INITIAL_PASSWORD;
  if (!researcherPassword) {
    throw new Error('RESEARCHER_INITIAL_PASSWORD 환경변수를 설정하세요.');
  }
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
  console.log(`✅ 연구원: ${researcher.email}`);

  // 6. 검토자 계정 생성 (개발/테스트용)
  const reviewerPassword = process.env.REVIEWER_INITIAL_PASSWORD || researcherPassword;
  const reviewerHash = await bcrypt.hash(reviewerPassword, 10);

  const reviewerUser = await prisma.user.upsert({
    where: { email: 'reviewer@labnote.local' },
    update: {},
    create: {
      id: 'user-reviewer-001',
      orgId: org.id,
      email: 'reviewer@labnote.local',
      name: '검토자',
      passwordHash: reviewerHash,
      roleId: reviewerRole.id,
      status: 'active',
    },
  });
  console.log(`✅ 검토자: ${reviewerUser.email}`);

  // 7. 열람자 계정 생성 (개발/테스트용)
  const viewerPassword = process.env.VIEWER_INITIAL_PASSWORD || researcherPassword;
  const viewerHash = await bcrypt.hash(viewerPassword, 10);

  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@labnote.local' },
    update: {},
    create: {
      id: 'user-viewer-001',
      orgId: org.id,
      email: 'viewer@labnote.local',
      name: '열람자',
      passwordHash: viewerHash,
      roleId: viewerRole.id,
      status: 'active',
    },
  });
  console.log(`✅ 열람자: ${viewerUser.email}`);

  console.log('\n🎉 시드 데이터 삽입 완료!');
  console.log('─────────────────────────────────────');
  console.log('로그인 계정:');
  console.log('  관리자:  admin@labnote.local');
  console.log('  연구원:  researcher@labnote.local');
  console.log('  검토자:  reviewer@labnote.local');
  console.log('  열람자:  viewer@labnote.local');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ 시드 실패:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
