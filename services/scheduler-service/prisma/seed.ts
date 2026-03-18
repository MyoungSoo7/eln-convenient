import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.resource.count();
  if (count > 0) {
    console.log('[seed] 이미 자원 데이터가 존재합니다. 건너뜁니다.');
    return;
  }

  await prisma.resource.createMany({
    data: [
      {
        id: 'res-default-equipment',
        name: '전자현미경',
        type: 'EQUIPMENT',
        location: 'A동 101호',
        description: '고해상도 전자현미경 (TEM)',
        isActive: true,
      },
      {
        id: 'res-default-room',
        name: '대회의실',
        type: 'ROOM',
        location: 'B동 201호',
        description: '대회의실 (최대 20인)',
        capacity: 20,
        isActive: true,
      },
      {
        id: 'res-equipment-002',
        name: '원심분리기',
        type: 'EQUIPMENT',
        location: 'A동 103호',
        description: '고속 원심분리기',
        isActive: true,
      },
      {
        id: 'res-room-002',
        name: '소회의실',
        type: 'ROOM',
        location: 'B동 202호',
        description: '소회의실 (최대 6인)',
        capacity: 6,
        isActive: true,
      },
    ],
  });

  console.log('[seed] 기본 자원 4개 생성 완료');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
