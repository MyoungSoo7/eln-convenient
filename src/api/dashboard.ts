/**
 * 대시보드 API 클라이언트
 * 경로: /api/dashboard
 *
 * API Gateway가 여러 서비스(ELN, Inventory, Scheduler, Signature/Audit)를
 * 병렬 호출하여 집계한 데이터를 단일 엔드포인트로 반환.
 */
import apiClient, { type ApiResponse } from './client';
import type { Note } from '@/lib/mockData';
import type { BackendBooking } from './scheduler';
import type { ExpiringItem } from './inventory';
import type { InventoryItem } from '@/lib/mockData';

export interface DashboardNoteStats {
  draft: number | null;
  in_progress: number | null;
  signed: number | null;
  locked: number | null;
  total: number | null;
}

export interface DashboardData {
  notes: DashboardNoteStats;
  compliance: { signed: number; pending: number; locked: number } | null;
  inventory: { total: number | null; lowStock: number | null };
  scheduler: { pendingBookings: number | null };
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    userId: string;
    details?: string;
    ipAddress?: string;
    createdAt: string;
  }[];
  recentNotes: Note[];
  upcomingBookings: BackendBooking[];
  lowStockItems: InventoryItem[];
  expiringItems: ExpiringItem[];
  generatedAt: string;
}

const ERR_CONN = '서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.';

export async function getDashboardData(): Promise<ApiResponse<DashboardData>> {
  try {
    return await apiClient.get<DashboardData>('/dashboard');
  } catch (err) {
    return {
      ok: false,
      data: null as unknown as DashboardData,
      error: (err as Error).message || ERR_CONN,
    };
  }
}

/** 개인 대시보드 */
export interface PersonalDashboardData {
  myNotes: { total: number; draft: number; inProgress: number; signed: number; locked: number };
  pendingActions: { unreadNotifications: number };
  recentNotes: Note[];
  myBookings: BackendBooking[];
  myActivity: { action: string; entityType: string; entityId: string; createdAt: string }[];
  generatedAt: string;
}

export async function getPersonalDashboard(): Promise<ApiResponse<PersonalDashboardData>> {
  try {
    return await apiClient.get<PersonalDashboardData>('/dashboard/personal');
  } catch (err) {
    return { ok: false, data: null as unknown as PersonalDashboardData, error: (err as Error).message || ERR_CONN };
  }
}

/** 팀 대시보드 */
export interface TeamDashboardData {
  teamNotes: { total: number; draft: number; inProgress: number; signed: number; locked: number };
  recentNotes: Note[];
  teamBookings: BackendBooking[];
  generatedAt: string;
}

export async function getTeamDashboard(teamId: string): Promise<ApiResponse<TeamDashboardData>> {
  try {
    return await apiClient.get<TeamDashboardData>(`/dashboard/team/${teamId}`);
  } catch (err) {
    return { ok: false, data: null as unknown as TeamDashboardData, error: (err as Error).message || ERR_CONN };
  }
}

/** 조직 대시보드 */
export async function getOrgDashboard(): Promise<ApiResponse<DashboardData>> {
  try {
    return await apiClient.get<DashboardData>('/dashboard/org');
  } catch (err) {
    return { ok: false, data: null as unknown as DashboardData, error: (err as Error).message || ERR_CONN };
  }
}
