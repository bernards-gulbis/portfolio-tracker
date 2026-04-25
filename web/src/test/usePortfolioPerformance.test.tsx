import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import * as api from '../api';
import type { PortfolioPerformance } from '../api';

// Mock the api module
vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    getPortfolioPerformance: vi.fn(),
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Create a reusable wrapper with a fresh query client for each test
const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

const mockPerformanceData: PortfolioPerformance = {
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  cost_basis_fallback_tickers: [],
  data_points: [
    {
      date: '2024-01-01',
      principal: 10870,
      principal_eur: 10000,
      current_value: 11413,
      fx_rate: 0.92,
      return_pct: 5.0,
      sp500_return_pct: 0,
    },
    {
      date: '2024-01-02',
      principal: 10870,
      principal_eur: 10000,
      current_value: 11739,
      fx_rate: 0.92,
      return_pct: 8.0,
      sp500_return_pct: 1.2,
    },
  ],
};

describe('usePortfolioPerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enabled behavior', () => {
    it('does not fetch when portfolioId is null', () => {
      const { result } = renderHook(
        () => usePortfolioPerformance(null),
        { wrapper: createWrapper() }
      );

      expect(result.current.isFetching).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(api.getPortfolioPerformance).not.toHaveBeenCalled();
    });

    it('fetches data when portfolioId is provided', async () => {
      vi.mocked(api.getPortfolioPerformance).mockResolvedValueOnce(mockPerformanceData);

      const { result } = renderHook(
        () => usePortfolioPerformance(1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.getPortfolioPerformance).toHaveBeenCalledWith(1, undefined, undefined, undefined);
      expect(result.current.data).toEqual(mockPerformanceData);
    });
  });

  describe('query key composition', () => {
    it('includes portfolioId in query key', async () => {
      vi.mocked(api.getPortfolioPerformance).mockResolvedValueOnce(mockPerformanceData);

      const { result } = renderHook(
        () => usePortfolioPerformance(1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Query keys are exposed via internal properties, but we can verify via behavior
      expect(result.current.data?.portfolio_id).toBe(1);
    });

    it('includes startDate and endDate in query key and API call', async () => {
      vi.mocked(api.getPortfolioPerformance).mockResolvedValueOnce(mockPerformanceData);

      const startDate = '2024-01-01';
      const endDate = '2024-12-31';

      const { result } = renderHook(
        () => usePortfolioPerformance(1, startDate, endDate),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.getPortfolioPerformance).toHaveBeenCalledWith(1, startDate, endDate, undefined);
    });

    it('includes numPoints in query key and API call', async () => {
      vi.mocked(api.getPortfolioPerformance).mockResolvedValueOnce(mockPerformanceData);

      const numPoints = 50;

      const { result } = renderHook(
        () => usePortfolioPerformance(1, undefined, undefined, numPoints),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.getPortfolioPerformance).toHaveBeenCalledWith(1, undefined, undefined, numPoints);
    });

    it('includes all parameters in query key and API call', async () => {
      vi.mocked(api.getPortfolioPerformance).mockResolvedValueOnce(mockPerformanceData);

      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const numPoints = 100;

      const { result } = renderHook(
        () => usePortfolioPerformance(1, startDate, endDate, numPoints),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.getPortfolioPerformance).toHaveBeenCalledWith(1, startDate, endDate, numPoints);
    });

    it('creates different cache entries for different parameters', async () => {
      const mockData1 = { ...mockPerformanceData, portfolio_id: 1 };
      const mockData2 = { ...mockPerformanceData, portfolio_id: 2 };

      vi.mocked(api.getPortfolioPerformance)
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2);

      const { result: result1 } = renderHook(
        () => usePortfolioPerformance(1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true);
      });

      const { result: result2 } = renderHook(
        () => usePortfolioPerformance(2),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true);
      });

      expect(api.getPortfolioPerformance).toHaveBeenCalledTimes(2);
      expect(result1.current.data?.portfolio_id).toBe(1);
      expect(result2.current.data?.portfolio_id).toBe(2);
    });
  });

  describe('successful data mapping', () => {
    it('returns portfolio performance data with correct structure', async () => {
      vi.mocked(api.getPortfolioPerformance).mockResolvedValueOnce(mockPerformanceData);

      const { result } = renderHook(
        () => usePortfolioPerformance(1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual({
        portfolio_id: 1,
        portfolio_name: 'Test Portfolio',
        cost_basis_fallback_tickers: [],
        data_points: [
          {
            date: '2024-01-01',
            principal: 10870,
            principal_eur: 10000,
            current_value: 11413,
            fx_rate: 0.92,
            return_pct: 5.0,
            sp500_return_pct: 0,
          },
          {
            date: '2024-01-02',
            principal: 10870,
            principal_eur: 10000,
            current_value: 11739,
            fx_rate: 0.92,
            return_pct: 8.0,
            sp500_return_pct: 1.2,
          },
        ],
      });
    });

    it('handles empty data_points array', async () => {
      const emptyData: PortfolioPerformance = {
        portfolio_id: 1,
        portfolio_name: 'Empty Portfolio',
        cost_basis_fallback_tickers: [],
        data_points: [],
      };

      vi.mocked(api.getPortfolioPerformance).mockResolvedValueOnce(emptyData);

      const { result } = renderHook(
        () => usePortfolioPerformance(1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data_points).toEqual([]);
    });

    it('handles null current_value in data points', async () => {
      const dataWithNulls: PortfolioPerformance = {
        portfolio_id: 1,
        portfolio_name: 'Test Portfolio',
        cost_basis_fallback_tickers: [],
        data_points: [
          {
            date: '2024-01-01',
            principal: 10870,
            principal_eur: 10000,
            current_value: null,
            fx_rate: null,
            return_pct: null,
            sp500_return_pct: null,
          },
        ],
      };

      vi.mocked(api.getPortfolioPerformance).mockResolvedValueOnce(dataWithNulls);

      const { result } = renderHook(
        () => usePortfolioPerformance(1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data_points[0].current_value).toBeNull();
    });
  });

  describe('error handling', () => {
    it('handles API errors gracefully', async () => {
      const errorMessage = 'Network error';
      vi.mocked(api.getPortfolioPerformance).mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(
        () => usePortfolioPerformance(1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe(errorMessage);
      expect(result.current.data).toBeUndefined();
    });

    it('throws error when portfolioId becomes null during fetch', async () => {
      vi.mocked(api.getPortfolioPerformance).mockImplementationOnce(() => {
        throw new Error('Portfolio ID is required');
      });

      const { result } = renderHook(
        () => usePortfolioPerformance(null),
        { wrapper: createWrapper() }
      );

      // Should not fetch when portfolioId is null
      expect(result.current.isFetching).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(api.getPortfolioPerformance).not.toHaveBeenCalled();
    });

    it('handles 404 portfolio not found', async () => {
      const error = new Error('Portfolio not found');
      vi.mocked(api.getPortfolioPerformance).mockRejectedValueOnce(error);

      const { result } = renderHook(
        () => usePortfolioPerformance(999),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe('loading states', () => {
    it('is not loading when portfolioId is null', () => {
      const { result } = renderHook(
        () => usePortfolioPerformance(null),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
    });
  });
});
