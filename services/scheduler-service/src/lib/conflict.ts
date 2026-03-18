import { BookingStatus, PrismaClient } from '@prisma/client';
import { ACTIVE_STATUSES } from './state-machine';

// Prisma 트랜잭션 클라이언트 타입
type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface ConflictInfo {
  id: string;
  startAt: Date;
  endAt: Date;
  userId: string;
  status: BookingStatus;
}

/**
 * 시간대 충돌 체크
 *
 * 충돌 조건: 새 예약의 startAt < 기존 예약 endAt AND 새 예약의 endAt > 기존 예약 startAt
 * = 두 구간이 조금이라도 겹치는 경우
 *
 * @param client  PrismaClient 또는 트랜잭션 클라이언트
 * @param resourceId  대상 자원 ID
 * @param startAt  새 예약 시작 시각
 * @param endAt  새 예약 종료 시각
 * @param excludeId  충돌 체크에서 제외할 예약 ID (수정/승인 시 자기 자신 제외)
 * @param statuses  충돌 체크 대상 상태 (기본: ACTIVE_STATUSES)
 */
export async function checkConflict(
  client: PrismaClient | PrismaTx,
  resourceId: string,
  startAt: Date,
  endAt: Date,
  excludeId?: string,
  statuses: BookingStatus[] = ACTIVE_STATUSES,
): Promise<ConflictInfo | null> {
  const conflict = await (client as PrismaClient).booking.findFirst({
    where: {
      resourceId,
      status: { in: statuses },
      startAt: { lt: endAt },   // 기존 예약이 새 예약 종료 전에 시작
      endAt: { gt: startAt },   // 기존 예약이 새 예약 시작 후에 종료
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      userId: true,
      status: true,
    },
    orderBy: { startAt: 'asc' },
  });

  return conflict;
}
