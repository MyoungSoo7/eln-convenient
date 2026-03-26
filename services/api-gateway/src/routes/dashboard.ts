import { FastifyInstance } from 'fastify';
import redis from '../lib/redis';

const ELN_URL       = process.env.ELN_SERVICE_URL       || 'http://eln-service:8002';
const SIG_URL       = process.env.SIGNATURE_SERVICE_URL || 'http://signature-audit-service:8003';
const INV_URL       = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8004';
const SCH_URL       = process.env.SCHEDULER_SERVICE_URL || 'http://scheduler-service:8005';

/** 내부 서비스 호출 — 실패 시 null 반환 */
async function safeGet<T>(url: string, headers: Record<string, string> = {}, raw = false): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = await res.json() as any;
    if (!body.ok) return null;
    return raw ? body : (body.data ?? body);
  } catch {
    return null;
  }
}

/** 요청 헤더에서 실제 사용자 권한 헤더를 구성한다 (permissions:['*'] 하드코딩 제거) */
function buildUserHeaders(request: any): Record<string, string> {
  return {
    'x-user-id': (request.headers['x-user-id'] as string) || '',
    'x-user-role': (request.headers['x-user-role'] as string) || '',
    'x-user-permissions': (request.headers['x-user-permissions'] as string) || '[]',
    'x-user-org-id': (request.headers['x-user-org-id'] as string) || '',
    'x-user-team-ids': (request.headers['x-user-team-ids'] as string) || '[]',
    'x-user-team-roles': (request.headers['x-user-team-roles'] as string) || '{}',
  };
}

/** 내부 서비스 호출용 admin 권한 헤더 (조직 대시보드 집계용) */
function buildAdminHeaders(request: any): Record<string, string> {
  return {
    'x-user-id': (request.headers['x-user-id'] as string) || '',
    'x-user-role': 'admin',
    'x-user-permissions': JSON.stringify(['*']),
    'x-user-org-id': (request.headers['x-user-org-id'] as string) || '',
  };
}

/** Redis 캐시 읽기 */
async function getCache(key: string): Promise<any | null> {
  if (!redis) return null;
  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

/** Redis 캐시 쓰기 */
async function setCache(key: string, data: any, ttl: number): Promise<void> {
  if (!redis) return;
  try { await redis.set(key, JSON.stringify(data), 'EX', ttl); } catch { /* 무시 */ }
}

export async function registerDashboard(app: FastifyInstance) {

  // ═══════════════════════════════════════════════════
  //  개인 대시보드 — 모든 인증 사용자
  // ═══════════════════════════════════════════════════
  app.get('/api/dashboard/personal', async (request, reply) => {
    const userId = (request.headers as any)['x-user-id'] as string;
    const userOrgId = (request.headers as any)['x-user-org-id'] as string;

    if (!userId) return reply.code(401).send({ ok: false, error: '인증이 필요합니다.' });

    const cacheKey = `cache:dashboard:personal:${userOrgId}:${userId}`;
    const cached = await getCache(cacheKey);
    if (cached) return reply.send(cached);

    const headers = buildUserHeaders(request);
    const today = new Date().toISOString().slice(0, 10);

    const [myNoteStats, myRecentNotes, myBookings, unreadCount, myAudit] =
      await Promise.allSettled([
        safeGet<any>(`${ELN_URL}/api/notes/stats?type=note&authorId=${userId}`, headers),
        safeGet<any>(`${ELN_URL}/api/notes?type=note&authorId=${userId}&limit=5`, headers),
        safeGet<any>(`${SCH_URL}/api/scheduler/bookings?userId=${userId}&from=${today}&limit=5`, headers, true),
        safeGet<any>(`${SIG_URL}/api/notifications/unread-count`, headers),
        safeGet<any>(`${SIG_URL}/api/audit?actorId=${userId}&limit=10`, headers),
      ]);

    const noteStats = myNoteStats.status === 'fulfilled' ? myNoteStats.value : null;
    let recentNotes: unknown[] = [];
    if (myRecentNotes.status === 'fulfilled' && myRecentNotes.value) {
      const val = myRecentNotes.value;
      recentNotes = Array.isArray(val) ? val.slice(0, 5) : (Array.isArray((val as any).data) ? (val as any).data.slice(0, 5) : []);
    }
    let bookings: unknown[] = [];
    if (myBookings.status === 'fulfilled' && myBookings.value) {
      const val = myBookings.value;
      bookings = Array.isArray(val) ? val.slice(0, 5) : (Array.isArray((val as any).data) ? (val as any).data.slice(0, 5) : []);
    }
    let auditLogs: unknown[] = [];
    if (myAudit.status === 'fulfilled' && Array.isArray(myAudit.value)) {
      auditLogs = myAudit.value.slice(0, 10);
    }

    const response = {
      ok: true,
      data: {
        myNotes: {
          total: noteStats?.total ?? 0,
          draft: noteStats?.draft ?? 0,
          inProgress: noteStats?.in_progress ?? 0,
          signed: noteStats?.signed ?? 0,
          locked: noteStats?.locked ?? 0,
        },
        pendingActions: {
          unreadNotifications: unreadCount.status === 'fulfilled' ? (unreadCount.value as any)?.count ?? 0 : 0,
        },
        recentNotes,
        myBookings: bookings,
        myActivity: auditLogs,
        generatedAt: new Date().toISOString(),
      },
    };

    await setCache(cacheKey, response, 120); // 2분
    return reply.send(response);
  });

  // ═══════════════════════════════════════════════════
  //  팀 대시보드 — 팀 리더 + admin
  // ═══════════════════════════════════════════════════
  app.get('/api/dashboard/team/:teamId', async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    const userRole = (request.headers as any)['x-user-role'] as string;
    const userOrgId = (request.headers as any)['x-user-org-id'] as string;
    const teamRoles: Record<string, string> = (() => {
      try { return JSON.parse((request.headers as any)['x-user-team-roles'] || '{}'); }
      catch { return {}; }
    })();

    // 접근 제어: admin 또는 해당 팀 리더만
    if (userRole !== 'admin' && teamRoles[teamId] !== 'leader') {
      return reply.code(403).send({
        ok: false,
        error: '팀 대시보드는 팀 리더 또는 관리자만 접근할 수 있습니다.',
      });
    }

    const cacheKey = `cache:dashboard:team:${userOrgId}:${teamId}`;
    const cached = await getCache(cacheKey);
    if (cached) return reply.send(cached);

    const headers = buildAdminHeaders(request);

    const [teamNoteStats, teamRecentNotes, teamBookings] =
      await Promise.allSettled([
        safeGet<any>(`${ELN_URL}/api/notes/stats?type=note&teamId=${teamId}`, headers),
        safeGet<any>(`${ELN_URL}/api/notes?type=note&teamId=${teamId}&limit=10`, headers),
        safeGet<any>(`${SCH_URL}/api/scheduler/bookings?limit=5`, headers, true),
      ]);

    const noteStats = teamNoteStats.status === 'fulfilled' ? teamNoteStats.value : null;
    let recentNotes: unknown[] = [];
    if (teamRecentNotes.status === 'fulfilled' && teamRecentNotes.value) {
      const val = teamRecentNotes.value;
      recentNotes = Array.isArray(val) ? val.slice(0, 10) : (Array.isArray((val as any).data) ? (val as any).data.slice(0, 10) : []);
    }
    let bookings: unknown[] = [];
    if (teamBookings.status === 'fulfilled' && teamBookings.value) {
      const val = teamBookings.value;
      bookings = Array.isArray(val) ? val.slice(0, 5) : (Array.isArray((val as any).data) ? (val as any).data.slice(0, 5) : []);
    }

    const response = {
      ok: true,
      data: {
        teamNotes: {
          total: noteStats?.total ?? 0,
          draft: noteStats?.draft ?? 0,
          inProgress: noteStats?.in_progress ?? 0,
          signed: noteStats?.signed ?? 0,
          locked: noteStats?.locked ?? 0,
        },
        recentNotes,
        teamBookings: bookings,
        generatedAt: new Date().toISOString(),
      },
    };

    await setCache(cacheKey, response, 180); // 3분
    return reply.send(response);
  });

  // ═══════════════════════════════════════════════════
  //  조직 대시보드 — admin 전용
  // ═══════════════════════════════════════════════════
  app.get('/api/dashboard/org', async (request, reply) => {
    const userRole = (request.headers as any)['x-user-role'] as string;

    if (userRole !== 'admin') {
      return reply.code(403).send({
        ok: false,
        error: '조직 대시보드는 관리자만 접근할 수 있습니다.',
      });
    }

    const userOrgId = (request.headers as any)['x-user-org-id'] as string;
    const cacheKey = `cache:dashboard:org:${userOrgId}`;
    const cached = await getCache(cacheKey);
    if (cached) return reply.send(cached);

    const headers = buildAdminHeaders(request);
    const today = new Date().toISOString().slice(0, 10);

    const [
      noteStats, complianceStats, invStats, invLowStock, invExpiring,
      bookingPending, recentAudit, recentNotes, upcomingBookings,
    ] = await Promise.allSettled([
      safeGet<any>(`${ELN_URL}/api/notes/stats?type=note`, headers),
      safeGet<any>(`${SIG_URL}/api/signatures/compliance/stats`, headers),
      safeGet<any>(`${INV_URL}/api/inventory/items?limit=1`, headers, true),
      safeGet<any>(`${INV_URL}/api/inventory/alerts/low-stock`, headers),
      safeGet<any>(`${INV_URL}/api/inventory/alerts/expiring?days=30`, headers),
      safeGet<any>(`${SCH_URL}/api/scheduler/bookings?status=PENDING&limit=1`, headers, true),
      safeGet<any>(`${SIG_URL}/api/audit?limit=10`, headers),
      safeGet<any>(`${ELN_URL}/api/notes?type=note&limit=4`, headers),
      safeGet<any>(`${SCH_URL}/api/scheduler/bookings?from=${today}&limit=4`, headers),
    ]);

    let notes: Record<string, number | null> = { draft: null, in_progress: null, signed: null, locked: null, total: null };
    if (noteStats.status === 'fulfilled' && noteStats.value) {
      const s = noteStats.value;
      notes = { draft: s.draft ?? null, in_progress: s.in_progress ?? null, signed: s.signed ?? null, locked: s.locked ?? null, total: s.total ?? null };
    }
    const compliance = complianceStats.status === 'fulfilled' ? complianceStats.value : null;
    const inventoryTotal = (invStats.status === 'fulfilled' ? (invStats.value as any)?.total : null) ?? null;
    const lowStockItems = invLowStock.status === 'fulfilled' && invLowStock.value ? invLowStock.value : [];
    const lowStockCount = Array.isArray(lowStockItems) ? lowStockItems.length : (lowStockItems as any)?.total ?? null;
    const expiringItems = invExpiring.status === 'fulfilled' && invExpiring.value ? invExpiring.value : [];
    const pendingBookings = (bookingPending.status === 'fulfilled' ? (bookingPending.value as any)?.total : null) ?? null;

    let auditLogs: unknown[] = [];
    if (recentAudit.status === 'fulfilled' && Array.isArray(recentAudit.value)) {
      auditLogs = recentAudit.value.slice(0, 10);
    }
    let recentNoteList: unknown[] = [];
    if (recentNotes.status === 'fulfilled' && recentNotes.value) {
      const val = recentNotes.value;
      recentNoteList = Array.isArray(val) ? val.slice(0, 4) : (Array.isArray((val as any).data) ? (val as any).data.slice(0, 4) : []);
    }
    let upcomingBookingList: unknown[] = [];
    if (upcomingBookings.status === 'fulfilled' && upcomingBookings.value) {
      const val = upcomingBookings.value;
      upcomingBookingList = Array.isArray(val) ? val.slice(0, 4) : (Array.isArray((val as any).data) ? (val as any).data.slice(0, 4) : []);
    }

    const response = {
      ok: true,
      data: {
        notes,
        compliance: compliance ?? null,
        inventory: { total: inventoryTotal, lowStock: lowStockCount },
        scheduler: { pendingBookings },
        recentActivity: auditLogs,
        recentNotes: recentNoteList,
        upcomingBookings: upcomingBookingList,
        lowStockItems: Array.isArray(lowStockItems) ? lowStockItems.slice(0, 5) : [],
        expiringItems: Array.isArray(expiringItems) ? expiringItems.slice(0, 5) : [],
        generatedAt: new Date().toISOString(),
      },
    };

    await setCache(cacheKey, response, 300); // 5분
    return reply.send(response);
  });

  // ═══════════════════════════════════════════════════
  //  기존 호환 — GET /api/dashboard (개인+조직 합산)
  // ═══════════════════════════════════════════════════
  app.get('/api/dashboard', async (request, reply) => {
    const userOrgId = (request.headers as any)['x-user-org-id'] as string;
    const userRole = (request.headers as any)['x-user-role'] as string;

    const cacheKey = `cache:dashboard:${userOrgId || 'default'}:${userRole || 'default'}`;
    const cached = await getCache(cacheKey);
    if (cached) return reply.send(cached);

    const headers = buildUserHeaders(request);
    const today = new Date().toISOString().slice(0, 10);

    const [
      noteStats, complianceStats, invStats, invLowStock, invExpiring,
      bookingPending, recentAudit, recentNotes, upcomingBookings,
    ] = await Promise.allSettled([
      safeGet<any>(`${ELN_URL}/api/notes/stats?type=note`, headers),
      safeGet<any>(`${SIG_URL}/api/signatures/compliance/stats`, headers),
      safeGet<any>(`${INV_URL}/api/inventory/items?limit=1`, headers, true),
      safeGet<any>(`${INV_URL}/api/inventory/alerts/low-stock`, headers),
      safeGet<any>(`${INV_URL}/api/inventory/alerts/expiring?days=30`, headers),
      safeGet<any>(`${SCH_URL}/api/scheduler/bookings?status=PENDING&limit=1`, headers, true),
      safeGet<any>(`${SIG_URL}/api/audit?limit=5`, headers),
      safeGet<any>(`${ELN_URL}/api/notes?type=note&limit=4`, headers),
      safeGet<any>(`${SCH_URL}/api/scheduler/bookings?from=${today}&limit=4`, headers),
    ]);

    let notes: Record<string, number | null> = { draft: null, in_progress: null, signed: null, locked: null, total: null };
    if (noteStats.status === 'fulfilled' && noteStats.value) {
      const s = noteStats.value;
      notes = { draft: s.draft ?? null, in_progress: s.in_progress ?? null, signed: s.signed ?? null, locked: s.locked ?? null, total: s.total ?? null };
    }
    const compliance = complianceStats.status === 'fulfilled' ? complianceStats.value : null;
    const inventoryTotal = (invStats.status === 'fulfilled' ? (invStats.value as any)?.total : null) ?? null;
    const lowStockItems = invLowStock.status === 'fulfilled' && invLowStock.value ? invLowStock.value : [];
    const lowStockCount = Array.isArray(lowStockItems) ? lowStockItems.length : (lowStockItems as any)?.total ?? null;
    const expiringItems = invExpiring.status === 'fulfilled' && invExpiring.value ? invExpiring.value : [];
    const pendingBookings = (bookingPending.status === 'fulfilled' ? (bookingPending.value as any)?.total : null) ?? null;
    let auditLogs: unknown[] = [];
    if (recentAudit.status === 'fulfilled' && Array.isArray(recentAudit.value)) {
      auditLogs = recentAudit.value.slice(0, 5);
    }
    let recentNoteList: unknown[] = [];
    if (recentNotes.status === 'fulfilled' && recentNotes.value) {
      const val = recentNotes.value;
      recentNoteList = Array.isArray(val) ? val.slice(0, 4) : (Array.isArray((val as any).data) ? (val as any).data.slice(0, 4) : []);
    }
    let upcomingBookingList: unknown[] = [];
    if (upcomingBookings.status === 'fulfilled' && upcomingBookings.value) {
      const val = upcomingBookings.value;
      upcomingBookingList = Array.isArray(val) ? val.slice(0, 4) : (Array.isArray((val as any).data) ? (val as any).data.slice(0, 4) : []);
    }

    const response = {
      ok: true,
      data: {
        notes,
        compliance: compliance ?? null,
        inventory: { total: inventoryTotal, lowStock: lowStockCount },
        scheduler: { pendingBookings },
        recentActivity: auditLogs,
        recentNotes: recentNoteList,
        upcomingBookings: upcomingBookingList,
        lowStockItems: Array.isArray(lowStockItems) ? lowStockItems.slice(0, 5) : [],
        expiringItems: Array.isArray(expiringItems) ? expiringItems.slice(0, 5) : [],
        generatedAt: new Date().toISOString(),
      },
    };

    await setCache(cacheKey, response, 300); // 5분
    return reply.send(response);
  });
}
