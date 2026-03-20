import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const TEMPLATE_CATEGORIES = [
  { value: 'ELN', sortOrder: 0 },
  { value: 'CODE-GUARD', sortOrder: 1 },
  { value: 'RAG', sortOrder: 2 },
  { value: 'Crawler', sortOrder: 3 },
  { value: 'ChatBot', sortOrder: 4 },
];

const INVENTORY_ITEM_TYPES = [
  { value: 'equipment', label: '장비', sortOrder: 0 },
  { value: 'license', label: '라이선스', sortOrder: 1 },
  { value: 'infrastructure', label: '인프라', sortOrder: 2 },
  { value: 'other', label: '기타', sortOrder: 99 },
];

async function main() {
  // 기본 조직 ID (auth-service seed와 동일)
  const orgId = 'org-default-001';

  // 기존 데이터 삭제 후 새로 삽입
  await prisma.code.deleteMany({ where: { orgId, group: 'TEMPLATE_CATEGORY' } });
  await prisma.code.deleteMany({ where: { orgId, group: 'INVENTORY_ITEM_TYPE' } });

  for (const cat of TEMPLATE_CATEGORIES) {
    await prisma.code.upsert({
      where: { orgId_group_value: { orgId, group: 'TEMPLATE_CATEGORY', value: cat.value } },
      update: { sortOrder: cat.sortOrder },
      create: {
        id: uuidv4(),
        group: 'TEMPLATE_CATEGORY',
        value: cat.value,
        sortOrder: cat.sortOrder,
        orgId,
      },
    });
  }

  console.log(`[seed] TEMPLATE_CATEGORY ${TEMPLATE_CATEGORIES.length}건 upsert 완료`);

  for (const item of INVENTORY_ITEM_TYPES) {
    await prisma.code.upsert({
      where: { orgId_group_value: { orgId, group: 'INVENTORY_ITEM_TYPE', value: item.value } },
      update: { label: item.label, sortOrder: item.sortOrder },
      create: {
        id: uuidv4(),
        group: 'INVENTORY_ITEM_TYPE',
        value: item.value,
        label: item.label,
        sortOrder: item.sortOrder,
        orgId,
      },
    });
  }

  console.log(`[seed] INVENTORY_ITEM_TYPE ${INVENTORY_ITEM_TYPES.length}건 upsert 완료`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
