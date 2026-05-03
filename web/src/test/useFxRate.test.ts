import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api', () => ({
  getFxRate: vi.fn(),
}));

import { getFxRate } from '../api';
import { useFxRate } from '../hooks/useFxRate';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useFxRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the rate for a valid YYYY-MM-DD date', async () => {
    vi.mocked(getFxRate).mockResolvedValue({
      date: '2024-03-15',
      usd_to_eur_rate: 0.918,
      source: 'historical',
    });

    const { result } = renderHook(() => useFxRate('2024-03-15'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFxRate).toHaveBeenCalledWith('2024-03-15');
    expect(result.current.data?.usd_to_eur_rate).toBe(0.918);
    expect(result.current.data?.source).toBe('historical');
  });

  it('does not fetch when date is undefined', () => {
    renderHook(() => useFxRate(undefined), { wrapper: createWrapper() });
    expect(getFxRate).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-date', '2024/03/15', '24-03-15', '2024-3-15'])(
    'does not fetch for malformed date %s',
    (date) => {
      renderHook(() => useFxRate(date), { wrapper: createWrapper() });
      expect(getFxRate).not.toHaveBeenCalled();
    },
  );
});
