import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AIAssistantPage from './AIAssistantPage';
import * as ai from '@/api/ai';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('AIAssistantPage', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('calls recommendTemplate with topic and renders results', async () => {
    vi.spyOn(ai, 'recommendTemplate').mockResolvedValue({
      ok: true,
      data: [{ templateId: 'tpl-1', name: 'PCR 프로토콜', score: 0.95, reason: '적합합니다.' }],
    });
    vi.spyOn(ai, 'getIndexStatus').mockResolvedValue({
      ok: true,
      data: { totalDocuments: 100, indexedDocuments: 95, pendingDocuments: 5, lastUpdated: '' },
    });

    render(<AIAssistantPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/CRISPR/), { target: { value: 'PCR 실험' } });
    fireEvent.click(screen.getByText('템플릿 추천받기'));

    await waitFor(() => expect(screen.getByText('PCR 프로토콜')).toBeInTheDocument());
    expect(ai.recommendTemplate).toHaveBeenCalledWith('PCR 실험');
  });

  it('shows error when recommendTemplate fails', async () => {
    vi.spyOn(ai, 'recommendTemplate').mockResolvedValue({
      ok: false, data: [], error: '템플릿 추천 요청에 실패했습니다.',
    });
    vi.spyOn(ai, 'getIndexStatus').mockResolvedValue({
      ok: true,
      data: { totalDocuments: 10, indexedDocuments: 10, pendingDocuments: 0, lastUpdated: '' },
    });

    render(<AIAssistantPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/CRISPR/), { target: { value: 'PCR 실험' } });
    fireEvent.click(screen.getByText('템플릿 추천받기'));

    await waitFor(() => expect(screen.getByText('템플릿 추천 요청에 실패했습니다.')).toBeInTheDocument());
  });
});
