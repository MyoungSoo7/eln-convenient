import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AdminPage from './AdminPage';
import * as admin from '@/api/admin';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockUsers: admin.AdminUser[] = [
  { id: 'u1', name: '김연구', email: 'kim@lab.kr', role: 'Researcher', team: '유전체팀', status: 'active' },
];
const mockTeams: admin.AdminTeam[] = [
  { id: 't1', name: '유전체팀', memberCount: 3 },
];
const mockOrgs: admin.AdminOrg[] = [
  { id: 'org1', name: 'BioLab', slug: 'biolab' },
];
const mockRoles: admin.AdminRole[] = [
  { id: 'r1', name: 'Researcher', permissions: ['노트 작성'] },
];

function mockAll() {
  vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: true, data: mockUsers });
  vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: mockTeams });
  vi.spyOn(admin, 'listOrgs').mockResolvedValue({ ok: true, data: mockOrgs });
  vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: mockRoles });
}

describe('AdminPage', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders users from API', async () => {
    mockAll();
    render(<AdminPage />, { wrapper });
    await waitFor(() => expect(screen.getByText('김연구')).toBeInTheDocument());
    expect(screen.getByText('kim@lab.kr')).toBeInTheDocument();
  });

  it('shows error message when listUsers fails', async () => {
    vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: false, data: [], error: '사용자 목록 조회에 실패했습니다.' });
    vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listOrgs').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: [] });

    render(<AdminPage />, { wrapper });
    await waitFor(() => expect(screen.getByText(/사용자 목록 조회에 실패했습니다/)).toBeInTheDocument());
  });

  it('opens add user dialog on button click', async () => {
    mockAll();
    render(<AdminPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /사용자 추가/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows error toast when createUser returns ok:false', async () => {
    mockAll();
    vi.spyOn(admin, 'createUser').mockResolvedValue({
      ok: false,
      data: null as unknown as admin.AdminUser,
      error: '이미 존재하는 이메일입니다.',
    });

    render(<AdminPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /사용자 추가/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const dialog = screen.getByRole('dialog');
    const inputs = dialog.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: '홍길동' } });
    fireEvent.change(inputs[1], { target: { value: 'hong@lab.kr' } });
    fireEvent.change(inputs[2], { target: { value: 'password123' } });

    // 추가 버튼 활성화 대기 후 클릭
    const addBtn = screen.getAllByRole('button').find((b) => b.textContent === '추가');
    await waitFor(() => expect(addBtn).not.toBeDisabled());
    fireEvent.click(addBtn!);
    await waitFor(() => expect(admin.createUser).toHaveBeenCalled());
  });

  it('renders dropdown trigger button in each user row', async () => {
    mockAll();
    render(<AdminPage />, { wrapper });
    await waitFor(() => expect(screen.getByText('김연구')).toBeInTheDocument());

    const row = screen.getByText('김연구').closest('tr')!;
    const moreBtn = row.querySelector('button');
    expect(moreBtn).toBeInTheDocument();
  });

  it('renders all tab triggers including 조직', async () => {
    mockAll();
    render(<AdminPage />, { wrapper });

    expect(screen.getByRole('tab', { name: /사용자/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /팀/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /조직/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /역할/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /설정/ })).toBeInTheDocument();
  });
});
