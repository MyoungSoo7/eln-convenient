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
        name: '기본장비',
        type: 'equipment',
        location: 'A동 101호',
        description: '범용 실험 장비',
        isActive: true,
      },
      {
        id: 'res-default-room',
        name: '기본 회의실',
        type: 'room',
        location: 'B동 201호',
        description: '기본 회의실 (최대 10인)',
        capacity: 10,
        isActive: true,
      },
    ],
  });

  console.log('[seed] 기본 자원 생성 완료: 기본장비, 기본 회의실');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
