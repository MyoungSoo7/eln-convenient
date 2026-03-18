import { FastifyInstance } from 'fastify';

const ELN_URL       = process.env.ELN_SERVICE_URL       || 'http://eln-service:8002';
const SIG_URL       = process.env.SIGNATURE_SERVICE_URL || 'http://signature-audit-service:8003';
const INV_URL       = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8004';
const SCH_URL       = process.env.SCHEDULER_SERVICE_URL || 'http://scheduler-service:8005';

/** 내부 서비스 호출 — 실패 시 null 반환 */
async function safeGet<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = await res.json() as any;
    return body.ok ? (body.data ?? body) : null;
  } catch {
    return null;
  }
}

export async function registerDashboard(app: FastifyInstance) {
  /**
   * GET /api/dashboard
   *
   * 여러 서비스 데이터를 집계하여 메인 대시보드용 통계 반환.
   * 개별 서비스 장애는 해당 섹션을 null로 처리하고 나머지는 정상 반환.
   */
  app.get('/api/dashboard', async (request, reply) => {
    const userId      = (request.headers as any)['x-user-id']    as string;
    const userRole    = (request.headers as any)['x-user-role']  as string;

    // 내부 서비스 호출용 헤더 (인증 헤더 포워딩)
    const internalHeaders: Record<string, string> = {
      'x-user-id': userId || 'system',
      'x-user-role': userRole || 'admin',
      'x-user-permissions': JSON.stringify(['*']),
    };

    // 모든 서비스 병렬 호출
    const [
      noteStats,
      complianceStats,
      invStats,
      invLowStock,
      bookingPending,
      recentAudit,
    ] = await Promise.allSettled([
      // 1) 노트 상태별 카운트 (status별 4번 호출)
      Promise.all([
        safeGet<any>(`${ELN_URL}/api/notes?type=note&status=draft&limit=1`, internalHeaders),
        safeGet<any>(`${ELN_URL}/api/notes?type=note&status=in_progress&limit=1`, internalHeaders),
        safeGet<any>(`${ELN_URL}/api/notes?type=note&status=signed&limit=1`, internalHeaders),
        safeGet<any>(`${ELN_URL}/api/notes?type=note&status=locked&limit=1`, internalHeaders),
      ]),
      // 2) 규정준수 통계 (서명완료/대기/잠금 카운트)
      safeGet<any>(`${SIG_URL}/api/signatures/compliance/stats`, internalHeaders),
      // 3) 인벤토리 전체 카운트
      safeGet<any>(`${INV_URL}/api/inventory/items?limit=1`, internalHeaders),
      // 4) 재고 부족 아이템
      safeGet<any>(`${INV_URL}/api/inventory/alerts/low-stock`, internalHeaders),
      // 5) 승인 대기 예약 카운트
      safeGet<any>(`${SCH_URL}/api/scheduler/bookings?status=pending&limit=1`, internalHeaders),
      // 6) 최근 감사로그 5건
      safeGet<any>(`${SIG_URL}/api/audit?limit=5`, internalHeaders),
    ]);

    // ── 노트 통계 조합 ──
    let notes: Record<string, number | null> = { draft: null, in_progress: null, signed: null, locked: null, total: null };
    if (noteStats.status === 'fulfilled' && noteStats.value) {
      const [draft, inProgress, signed, locked] = noteStats.value;
      notes = {
        draft:       draft?.total        ?? null,
        in_progress: inProgress?.total   ?? null,
        signed:      signed?.total       ?? null,
        locked:      locked?.total       ?? null,
        total: (draft?.total ?? 0) + (inProgress?.total ?? 0) + (signed?.total ?? 0) + (locked?.total ?? 0),
      };
    }

    // ── 규정준수 ──
    const compliance = complianceStats.status === 'fulfilled' ? complianceStats.value : null;

    // ── 인벤토리 ──
    const inventoryTotal   = (invStats.status === 'fulfilled'    ? (invStats.value as any)?.total    : null) ?? null;
    const lowStockCount    = (invLowStock.status === 'fulfilled' ? (invLowStock.value as any)?.total : null) ?? null;

    // ── 스케줄러 ──
    const pendingBookings  = (bookingPending.status === 'fulfilled' ? (bookingPending.value as any)?.total : null) ?? null;

    // ── 감사로그 ──
    let auditLogs: unknown[] = [];
    if (recentAudit.status === 'fulfilled' && Array.isArray(recentAudit.value)) {
      auditLogs = recentAudit.value.slice(0, 5);
    }

    return reply.send({
      ok: true,
      data: {
        notes,
        compliance: compliance ?? null,
        inventory: {
          total:    inventoryTotal,
          lowStock: lowStockCount,
        },
        scheduler: {
          pendingBookings,
        },
        recentActivity: auditLogs,
        generatedAt: new Date().toISOString(),
      },
    });
  });
}
