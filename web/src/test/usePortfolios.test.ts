import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  usePortfolios,
  useCreatePortfolio,
  useUpdatePortfolio,
  useDeletePortfolio,
  useCopyPortfolio,
} from '../hooks/usePortfolios';
import * as api from '../api';
import type { Portfolio } from '../api';
import { toast } from 'sonner';

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    getPortfolios: vi.fn(),
    createPortfolio: vi.fn(),
    updatePortfolio: vi.fn(),
    deletePortfolio: vi.fn(),
    copyPortfolio: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const mockPortfolio: Portfolio = {
  id: 1,
  name: 'Test Portfolio',
  created_at: '2024-01-01T00:00:00',
};

describe('usePortfolios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches portfolio list and returns data', async () => {
    vi.mocked(api.getPortfolios).mockResolvedValueOnce([mockPortfolio]);

    const { result } = renderHook(() => usePortfolios(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.getPortfolios).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual([mockPortfolio]);
  });

  it('handles empty portfolio list', async () => {
    vi.mocked(api.getPortfolios).mockResolvedValueOnce([]);

    const { result } = renderHook(() => usePortfolios(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors', async () => {
    vi.mocked(api.getPortfolios).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => usePortfolios(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useCreatePortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createPortfolio API and invalidates portfolios query on success', async () => {
    vi.mocked(api.createPortfolio).mockResolvedValueOnce(mockPortfolio);
    vi.mocked(api.getPortfolios).mockResolvedValue([mockPortfolio]);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreatePortfolio(), { wrapper });

    await result.current.mutateAsync({ name: 'Test Portfolio' });

    expect(api.createPortfolio).toHaveBeenCalledWith({ name: 'Test Portfolio' });
  });

  it('shows success toast with portfolio name', async () => {
    vi.mocked(api.createPortfolio).mockResolvedValueOnce(mockPortfolio);
    vi.mocked(api.getPortfolios).mockResolvedValue([]);

    const { result } = renderHook(() => useCreatePortfolio(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ name: 'Test Portfolio' });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Portfolio "Test Portfolio" created');
    });
  });

  it('propagates API errors', async () => {
    vi.mocked(api.createPortfolio).mockRejectedValueOnce(new Error('Duplicate name'));

    const { result } = renderHook(() => useCreatePortfolio(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ name: 'Test' })).rejects.toThrow('Duplicate name');
  });
});

describe('useUpdatePortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updatePortfolio API with correct arguments', async () => {
    vi.mocked(api.updatePortfolio).mockResolvedValueOnce({ ...mockPortfolio, name: 'Renamed' });
    vi.mocked(api.getPortfolios).mockResolvedValue([]);

    const { result } = renderHook(() => useUpdatePortfolio(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ portfolioId: 1, data: { name: 'Renamed' } });

    expect(api.updatePortfolio).toHaveBeenCalledWith(1, { name: 'Renamed' });
  });

  it('shows success toast with the new portfolio name', async () => {
    vi.mocked(api.updatePortfolio).mockResolvedValueOnce({ ...mockPortfolio, name: 'Renamed' });
    vi.mocked(api.getPortfolios).mockResolvedValue([]);

    const { result } = renderHook(() => useUpdatePortfolio(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ portfolioId: 1, data: { name: 'Renamed' } });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Portfolio renamed to "Renamed"');
    });
  });
});

describe('useDeletePortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deletePortfolio API with the correct portfolio ID', async () => {
    vi.mocked(api.deletePortfolio).mockResolvedValueOnce(undefined);
    vi.mocked(api.getPortfolios).mockResolvedValue([]);

    const { result } = renderHook(() => useDeletePortfolio(), { wrapper: createWrapper() });

    await result.current.mutateAsync(1);

    expect(api.deletePortfolio).toHaveBeenCalledWith(1);
  });

  it('shows success toast on delete', async () => {
    vi.mocked(api.deletePortfolio).mockResolvedValueOnce(undefined);
    vi.mocked(api.getPortfolios).mockResolvedValue([]);

    const { result } = renderHook(() => useDeletePortfolio(), { wrapper: createWrapper() });

    await result.current.mutateAsync(1);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Portfolio deleted');
    });
  });
});

describe('useCopyPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls copyPortfolio API with portfolioId and newName', async () => {
    vi.mocked(api.copyPortfolio).mockResolvedValueOnce({ ...mockPortfolio, id: 2, name: 'Copy' });
    vi.mocked(api.getPortfolios).mockResolvedValue([]);

    const { result } = renderHook(() => useCopyPortfolio(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ portfolioId: 1, newName: 'Copy' });

    expect(api.copyPortfolio).toHaveBeenCalledWith(1, 'Copy');
  });

  it('shows success toast with the copied portfolio name', async () => {
    vi.mocked(api.copyPortfolio).mockResolvedValueOnce({ ...mockPortfolio, id: 2, name: 'Copy' });
    vi.mocked(api.getPortfolios).mockResolvedValue([]);

    const { result } = renderHook(() => useCopyPortfolio(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ portfolioId: 1, newName: 'Copy' });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Portfolio copied as "Copy"');
    });
  });
});
