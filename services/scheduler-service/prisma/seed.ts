/**
 * scheduler-service 시드 데이터
 * IT연구소 R&D팀 — 장비/회의실
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 기존 데이터 삭제 후 재생성
  await prisma.booking.deleteMany({});
  await prisma.resource.deleteMany({});

  await prisma.resource.createMany({
    data: [
      // === 장비 ===
      {
        id: 'res-gpu-server-01',
        orgId: 'org-default-001',
        name: 'GPU 학습 서버 #1',
        type: 'EQUIPMENT',
        location: 'IT연구소 서버실 A',
        description: 'NVIDIA A100 x4, 256GB RAM — 딥러닝 모델 학습용',
        ownerId: 'user-admin-001',
        isActive: true,
      },
      {
        id: 'res-gpu-server-02',
        orgId: 'org-default-001',
        name: 'GPU 학습 서버 #2',
        type: 'EQUIPMENT',
        location: 'IT연구소 서버실 A',
        description: 'NVIDIA A100 x2, 128GB RAM — 추론/파인튜닝용',
        ownerId: 'user-admin-001',
        isActive: true,
      },
      {
        id: 'res-test-server-01',
        orgId: 'org-default-001',
        name: '스테이징 서버',
        type: 'EQUIPMENT',
        location: 'IT연구소 서버실 B',
        description: '통합테스트/QA 환경, 64GB RAM, 16core',
        ownerId: 'user-admin-001',
        isActive: true,
      },
      {
        id: 'res-load-tester',
        orgId: 'org-default-001',
        name: '부하테스트 장비',
        type: 'EQUIPMENT',
        location: 'IT연구소 서버실 B',
        description: 'k6/Locust 전용 부하 생성기, 10GbE NIC',
        ownerId: 'user-reviewer-001',
        isActive: true,
      },
      {
        id: 'res-nas-01',
        orgId: 'org-default-001',
        name: 'NAS 스토리지',
        type: 'EQUIPMENT',
        location: 'IT연구소 서버실 A',
        description: '데이터셋 공유 스토리지, 100TB',
        ownerId: 'user-admin-001',
        isActive: true,
      },
      // === 회의실 ===
      {
        id: 'res-room-large',
        orgId: 'org-default-001',
        name: '대회의실 (스프린트룸)',
        type: 'ROOM',
        location: 'IT연구소 3층 301호',
        description: '스프린트 회고/데모용, 프로젝터 + 화이트보드',
        capacity: 20,
        isActive: true,
      },
      {
        id: 'res-room-small-01',
        orgId: 'org-default-001',
        name: '소회의실 A (포커스룸)',
        type: 'ROOM',
        location: 'IT연구소 3층 302호',
        description: '코드 리뷰/페어 프로그래밍용',
        capacity: 4,
        isActive: true,
      },
      {
        id: 'res-room-small-02',
        orgId: 'org-default-001',
        name: '소회의실 B (브레인스톰)',
        type: 'ROOM',
        location: 'IT연구소 3층 303호',
        description: '설계 논의/아이디어 회의용, 대형 모니터',
        capacity: 6,
        isActive: true,
      },
    ],
  });

  console.log('[seed] IT연구소 자원 8개 생성 완료 (장비 5 + 회의실 3)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
