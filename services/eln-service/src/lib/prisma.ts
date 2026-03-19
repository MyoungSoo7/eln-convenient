import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });

// ── 소프트 삭제 미들웨어: deletedAt IS NULL 자동 필터링 ──
const softDeleteModels = ['Note'];
const softDeleteActions = ['findFirst', 'findMany', 'count', 'findUnique'];

prisma.$use(async (params, next) => {
  if (
    params.model &&
    softDeleteModels.includes(params.model) &&
    softDeleteActions.includes(params.action ?? '')
  ) {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};

    // 명시적으로 deletedAt를 지정하지 않은 경우에만 자동 필터링
    if (params.args.where.deletedAt === undefined) {
      params.args.where.deletedAt = null;
    }
  }
  return next(params);
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
