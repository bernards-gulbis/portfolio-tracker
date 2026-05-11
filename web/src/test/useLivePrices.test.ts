import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api', () => ({
  getLivePrices: vi.fn(),
}));

import { getLivePrices } from '../api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

// Import after mock
import { useLivePrices } from '../hooks/useLivePrices';

describe('useLivePrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches with empty tickers when enabled (FX-only polling for cash-only portfolios)', async () => {
    vi.mocked(getLivePrices).mockResolvedValue({
      prices: {},
      usd_to_eur_rate: 0.91,
      timestamp: '2026-03-03T12:00:00Z',
      provider_unavailable: false,
    });

    const { result } = renderHook(() => useLivePrices([], true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getLivePrices).toHaveBeenCalledWith([]);
    expect(result.current.data?.usd_to_eur_rate).toBe(0.91);
  });

  it('does not fetch when enabled is false', () => {
    renderHook(() => useLivePrices(['AAPL'], false), { wrapper: createWrapper() });
    expect(getLivePrices).not.toHaveBeenCalled();
  });

  it('fetches when tickers are provided and enabled', async () => {
    vi.mocked(getLivePrices).mockResolvedValue({
      prices: {
        AAPL: { price: 150, source: 'live', as_of: '2026-03-03T12:00:00Z', previous_close: null },
      },
      usd_to_eur_rate: 0.91,
      timestamp: '2026-03-03T12:00:00Z',
      provider_unavailable: false,
    });

    const { result } = renderHook(() => useLivePrices(['AAPL'], true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getLivePrices).toHaveBeenCalledWith(['AAPL']);
    expect(result.current.data?.prices.AAPL.price).toBe(150);
  });

  it('uses sorted tickers in the query key (same cache for different order)', async () => {
    vi.mocked(getLivePrices).mockResolvedValue({
      prices: {
        AAPL: { price: 150, source: 'live', as_of: '2026-03-03T12:00:00Z', previous_close: null },
        MSFT: { price: 420, source: 'live', as_of: '2026-03-03T12:00:00Z', previous_close: null },
      },
      usd_to_eur_rate: 0.91,
      timestamp: '2026-03-03T12:00:00Z',
      provider_unavailable: false,
    });

    const wrapper = createWrapper();

    // First render with ['MSFT', 'AAPL'], then rerender with ['AAPL', 'MSFT']
    const { result, rerender } = renderHook(
      ({ tickers }: { tickers: string[] }) => useLivePrices(tickers, true),
      { wrapper, initialProps: { tickers: ['MSFT', 'AAPL'] } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Rerender with different ticker order — sorted key is identical
    rerender({ tickers: ['AAPL', 'MSFT'] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // getLivePrices should only have been called once (cache hit)
    expect(getLivePrices).toHaveBeenCalledTimes(1);
  });
});
