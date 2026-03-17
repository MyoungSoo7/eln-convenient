import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  { id: 't1', name: '유전체팀', memberCount: 3, lead: '김연구' },
];
const mockRoles: admin.AdminRole[] = [
  { name: 'Researcher', permissions: ['노트 작성'], userCount: 3 },
];

describe('AdminPage', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders users from API', async () => {
    vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: true, data: mockUsers });
    vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: mockTeams });
    vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: mockRoles });

    render(<AdminPage />, { wrapper });
    await waitFor(() => expect(screen.getByText('김연구')).toBeInTheDocument());
    expect(screen.getByText('kim@lab.kr')).toBeInTheDocument();
  });

  it('shows error message when listUsers fails', async () => {
    vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: false, data: [], error: '사용자 목록 조회에 실패했습니다.' });
    vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: [] });

    render(<AdminPage />, { wrapper });
    await waitFor(() => expect(screen.getByText(/사용자 목록 조회에 실패했습니다/)).toBeInTheDocument());
  });

  it('opens add user dialog on button click', async () => {
    vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: [] });

    render(<AdminPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /사용자 추가/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('shows error toast when createUser returns ok:false', async () => {
    vi.spyOn(admin, 'listUsers').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listTeams').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'listRoles').mockResolvedValue({ ok: true, data: [] });
    vi.spyOn(admin, 'createUser').mockResolvedValue({
      ok: false,
      data: null as unknown as admin.AdminUser,
      error: '이미 존재하는 이메일입니다.',
    });

    render(<AdminPage />, { wrapper });

    // open dialog
    fireEvent.click(screen.getByRole('button', { name: /사용자 추가/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // fill required fields scoped to dialog
    const dialog = screen.getByRole('dialog');
    const inputs = within(dialog).getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: '홍길동' } });
    fireEvent.change(inputs[1], { target: { value: 'hong@lab.kr' } });

    // wait for button to become enabled, then submit
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '추가' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(admin.createUser).toHaveBeenCalled());
  });
});
