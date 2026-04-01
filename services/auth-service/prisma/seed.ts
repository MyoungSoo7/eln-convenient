/**
 * auth-service 시드 데이터
 * IT연구소 R&D팀 기준
 * 실행: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { RolePermissions } from '@lab/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 시드 데이터 삽입 시작 (IT연구소 R&D팀)...');

  // 1. 조직
  const org = await prisma.organization.upsert({
    where: { slug: 'default-lab' },
    update: { name: 'IT연구소' },
    create: {
      id: 'org-default-001',
      name: 'IT연구소',
      slug: 'default-lab',
    },
  });
  console.log(`✅ 조직: ${org.name}`);

  // 2. 역할
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

  // 3. 팀
  const platformTeam = await prisma.team.upsert({
    where: { id: 'team-default-001' },
    update: { name: '플랫폼개발팀' },
    create: {
      id: 'team-default-001',
      orgId: org.id,
      name: '플랫폼개발팀',
    },
  });

  const aiTeam = await prisma.team.upsert({
    where: { id: 'team-ai-001' },
    update: { name: 'AI연구팀' },
    create: {
      id: 'team-ai-001',
      orgId: org.id,
      name: 'AI연구팀',
    },
  });

  const infraTeam = await prisma.team.upsert({
    where: { id: 'team-infra-001' },
    update: { name: '인프라팀' },
    create: {
      id: 'team-infra-001',
      orgId: org.id,
      name: '인프라팀',
    },
  });
  console.log(`✅ 팀: ${platformTeam.name}, ${aiTeam.name}, ${infraTeam.name}`);

  // 4. 사용자
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_INITIAL_PASSWORD 환경변수를 설정하세요.');
  }
  const researcherPassword = process.env.RESEARCHER_INITIAL_PASSWORD;
  if (!researcherPassword) {
    throw new Error('RESEARCHER_INITIAL_PASSWORD 환경변수를 설정하세요.');
  }
  const reviewerPassword = process.env.REVIEWER_INITIAL_PASSWORD || researcherPassword;
  const viewerPassword = process.env.VIEWER_INITIAL_PASSWORD || researcherPassword;

  const users = [
    { id: 'user-admin-001', email: 'admin@labnote.local', name: '김태호', password: adminPassword, roleId: adminRole.id, teamId: platformTeam.id },
    { id: 'user-researcher-001', email: 'researcher@labnote.local', name: '이서연', password: researcherPassword, roleId: researcherRole.id, teamId: aiTeam.id },
    { id: 'user-reviewer-001', email: 'reviewer@labnote.local', name: '박준영', password: reviewerPassword, roleId: reviewerRole.id, teamId: platformTeam.id },
    { id: 'user-viewer-001', email: 'viewer@labnote.local', name: '최민지', password: viewerPassword, roleId: viewerRole.id, teamId: infraTeam.id },
    { id: 'user-researcher-002', email: 'dev1@labnote.local', name: '정하은', password: researcherPassword, roleId: researcherRole.id, teamId: platformTeam.id },
    { id: 'user-researcher-003', email: 'dev2@labnote.local', name: '한지우', password: researcherPassword, roleId: researcherRole.id, teamId: infraTeam.id },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: {
        id: u.id,
        orgId: org.id,
        email: u.email,
        name: u.name,
        passwordHash: hash,
        roleId: u.roleId,
        status: 'active',
      },
    });

    // 팀 멤버 등록
    await prisma.teamMember.upsert({
      where: { userId_teamId: { userId: u.id, teamId: u.teamId } },
      update: {},
      create: { userId: u.id, teamId: u.teamId },
    });
  }
  console.log(`✅ 사용자 ${users.length}명 생성 + 팀 배정 완료`);

  console.log('\n🎉 시드 데이터 삽입 완료!');
  console.log('─────────────────────────────────────');
  console.log('로그인 계정:');
  console.log('  김태호 (관리자):    admin@labnote.local');
  console.log('  이서연 (연구원):    researcher@labnote.local');
  console.log('  박준영 (검토자):    reviewer@labnote.local');
  console.log('  최민지 (열람자):    viewer@labnote.local');
  console.log('  정하은 (연구원):    dev1@labnote.local');
  console.log('  한지우 (연구원):    dev2@labnote.local');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ 시드 실패:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
