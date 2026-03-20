import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const TEMPLATE_CATEGORIES = [
  { value: '기본', sortOrder: 0 },
  { value: '분자생물학', sortOrder: 1 },
  { value: '세포생물학', sortOrder: 2 },
  { value: '생화학', sortOrder: 3 },
  { value: '미생물학', sortOrder: 4 },
  { value: '분석화학', sortOrder: 5 },
  { value: '일반', sortOrder: 6 },
  { value: '기타', sortOrder: 99 },
];

const INVENTORY_ITEM_TYPES = [
  { value: 'reagent', label: '시약', sortOrder: 0 },
  { value: 'sample', label: '샘플', sortOrder: 1 },
  { value: 'equipment', label: '장비', sortOrder: 2 },
  { value: 'consumable', label: '소모품', sortOrder: 3 },
  { value: 'antibody', label: '항체', sortOrder: 4 },
  { value: 'plasmid', label: '플라스미드', sortOrder: 5 },
  { value: 'cell_line', label: '세포주', sortOrder: 6 },
  { value: 'output', label: '산출물', sortOrder: 7 },
  { value: 'license', label: '라이선스', sortOrder: 8 },
  { value: 'infrastructure', label: '인프라', sortOrder: 9 },
  { value: 'other', label: '기타', sortOrder: 99 },
];

async function main() {
  // 기본 조직 ID (auth-service seed와 동일)
  const orgId = 'org-default-001';

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
