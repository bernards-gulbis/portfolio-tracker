import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { AxiosHeaders } from 'axios';
import {
  isApiError,
  getErrorMessage,
  TransactionType,
} from '../api';

describe('api.ts', () => {
  describe('isApiError', () => {
    it('returns true for AxiosError with detail in response data', () => {
      const err = new axios.AxiosError('fail', '400', undefined, undefined, {
        status: 400,
        data: { detail: 'bad request' },
        statusText: 'Bad Request',
        headers: {} as AxiosHeaders,
        config: { headers: {} as AxiosHeaders },
      });
      expect(isApiError(err)).toBe(true);
    });

    it('returns false for plain Error', () => {
      expect(isApiError(new Error('oops'))).toBe(false);
    });

    it('returns false for non-object response data', () => {
      const err = new axios.AxiosError('fail', '500', undefined, undefined, {
        status: 500,
        data: 'string body',
        statusText: 'Internal Server Error',
        headers: {} as AxiosHeaders,
        config: { headers: {} as AxiosHeaders },
      });
      expect(isApiError(err)).toBe(false);
    });

    it('returns false for response data without detail', () => {
      const err = new axios.AxiosError('fail', '400', undefined, undefined, {
        status: 400,
        data: { message: 'no detail field' },
        statusText: 'Bad Request',
        headers: {} as AxiosHeaders,
        config: { headers: {} as AxiosHeaders },
      });
      expect(isApiError(err)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isApiError(null)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('extracts detail from API error', () => {
      const err = new axios.AxiosError('fail', '400', undefined, undefined, {
        status: 400,
        data: { detail: 'Portfolio not found' },
        statusText: 'Bad Request',
        headers: {} as AxiosHeaders,
        config: { headers: {} as AxiosHeaders },
      });
      expect(getErrorMessage(err)).toBe('Portfolio not found');
    });

    it('returns message from Error', () => {
      expect(getErrorMessage(new Error('Something broke'))).toBe('Something broke');
    });

    it('returns fallback for unknown error', () => {
      expect(getErrorMessage('string error')).toBe('An unknown error occurred');
      expect(getErrorMessage(42)).toBe('An unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
    });
  });

  describe('isApiError edge cases', () => {
    it('returns false for AxiosError without response', () => {
      const err = new axios.AxiosError('Network Error', 'ERR_NETWORK');
      expect(isApiError(err)).toBe(false);
    });

    it('returns false for AxiosError with null response data', () => {
      const err = new axios.AxiosError('fail', '500', undefined, undefined, {
        status: 500,
        data: null,
        statusText: 'Internal Server Error',
        headers: {} as AxiosHeaders,
        config: { headers: {} as AxiosHeaders },
      });
      expect(isApiError(err)).toBe(false);
    });
  });

  describe('TransactionType enum', () => {
    it('has all expected transaction types', () => {
      expect(TransactionType.DEPOSIT).toBe('Deposit');
      expect(TransactionType.BUY).toBe('Buy');
      expect(TransactionType.SELL).toBe('Sell');
      expect(TransactionType.WITHDRAW).toBe('Withdraw');
      expect(TransactionType.DIVIDEND).toBe('Dividend');
      expect(TransactionType.FEE).toBe('Fee');
      expect(TransactionType.SPLIT).toBe('Split');
    });
  });

  describe('getErrorMessage with nested errors', () => {
    it('prefers API detail over error message', () => {
      const err = new axios.AxiosError('Network Error', '422', undefined, undefined, {
        status: 422,
        data: { detail: 'Validation failed' },
        statusText: 'Unprocessable Entity',
        headers: {} as AxiosHeaders,
        config: { headers: {} as AxiosHeaders },
      });
      expect(getErrorMessage(err)).toBe('Validation failed');
    });

    it('falls back to AxiosError message when no response data detail', () => {
      const err = new axios.AxiosError('Request timeout', 'ECONNABORTED');
      expect(getErrorMessage(err)).toBe('Request timeout');
    });
  });
});

// ================== HTTP API Functions ==================
// We test these by spying on the default axios instance after it's created by api.ts

import apiInstance, {
  getPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  copyPortfolio,
  getPortfolioStatus,
  getLivePrices,
  getPortfolioPerformance,
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  exportTransactionsCSV,
  importTransactionsCSV,
  getCurrentUser,
  getGoogleAuthorizeUrl,
  login,
  register,
  logoutApi,
  updateUser,
  closeAccount,
} from '../api';

import type {
  Portfolio,
  PortfolioStatus,
  Transaction,
  PaginatedTransactionResponse,
  UserRead,
  PortfolioPerformance,
  LivePrices,
} from '../api';

const mockPortfolio: Portfolio = { id: 1, name: 'Test Portfolio', created_at: '2024-01-01T00:00:00' };

const mockStatus: PortfolioStatus = {
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  principal: 8000,
  principal_eur: 7360,
  principal_eur_avg: 7360,
  dividends: 0,
  dividends_eur: null,
  cash: 500,
  holdings: [],
  holdings_cost: 0,
  realized_gains: 0,
  realized_sales: [],
  dividends_received: [],
  realized_withdrawals: [],
  capital_gains_tax_rate: 0.255,
  warnings: [],
  usd_to_eur_rate: 0.92,
  eur_incomplete: false,
  fx_missing_tx_ids: [],
};

const mockTransaction: Transaction = {
  id: 1,
  portfolio_id: 1,
  date: '2024-01-01T00:00:00',
  type: TransactionType.DEPOSIT,
  ticker: null,
  quantity: null,
  price_per_share: null,
  fee: 0,
  total_amount: 1000,
  eur_amount: 920,
  split_ratio: null,
};

const mockPaginatedResponse: PaginatedTransactionResponse = {
  transactions: [mockTransaction],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

const mockUser: UserRead = {
  id: 'user-123',
  email: 'test@example.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
  name: 'Test User',
  picture: null,
  oauth_providers: [],
  tax_rate: 0.255,
};

const mockPerformance: PortfolioPerformance = {
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  data_points: [],
  cost_basis_fallback_tickers: [],
};

const mockLivePrices: LivePrices = {
  prices: { AAPL: { price: 200, source: 'live', as_of: '2026-01-01T12:00:00Z' } },
  usd_to_eur_rate: 0.92,
  timestamp: '2026-01-01T12:00:00Z',
};

describe('Portfolio API functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getPortfolios fetches and returns portfolio list', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: [mockPortfolio] });
    const result = await getPortfolios();
    expect(spy).toHaveBeenCalledWith('/portfolios/');
    expect(result).toEqual([mockPortfolio]);
  });

  it('createPortfolio posts and returns new portfolio', async () => {
    const spy = vi.spyOn(apiInstance, 'post').mockResolvedValueOnce({ data: mockPortfolio });
    const result = await createPortfolio({ name: 'Test Portfolio' });
    expect(spy).toHaveBeenCalledWith('/portfolios/', { name: 'Test Portfolio' });
    expect(result).toEqual(mockPortfolio);
  });

  it('updatePortfolio sends PUT and returns updated portfolio', async () => {
    const updated = { ...mockPortfolio, name: 'Renamed' };
    const spy = vi.spyOn(apiInstance, 'put').mockResolvedValueOnce({ data: updated });
    const result = await updatePortfolio(1, { name: 'Renamed' });
    expect(spy).toHaveBeenCalledWith('/portfolios/1', { name: 'Renamed' });
    expect(result.name).toBe('Renamed');
  });

  it('deletePortfolio sends DELETE', async () => {
    const spy = vi.spyOn(apiInstance, 'delete').mockResolvedValueOnce({ data: undefined });
    await deletePortfolio(1);
    expect(spy).toHaveBeenCalledWith('/portfolios/1');
  });

  it('copyPortfolio posts to /copy and returns new portfolio', async () => {
    const copied = { ...mockPortfolio, id: 2, name: 'Copy' };
    const spy = vi.spyOn(apiInstance, 'post').mockResolvedValueOnce({ data: copied });
    const result = await copyPortfolio(1, { new_name: 'Copy' });
    expect(spy).toHaveBeenCalledWith('/portfolios/1/copy', { new_name: 'Copy' });
    expect(result.id).toBe(2);
  });

  it('getPortfolioStatus fetches and returns status', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockStatus });
    const result = await getPortfolioStatus(1);
    expect(spy).toHaveBeenCalledWith('/portfolios/1/status');
    expect(result).toEqual(mockStatus);
  });

  it('getLivePrices fetches prices for given tickers', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockLivePrices });
    const result = await getLivePrices(['AAPL']);
    expect(spy).toHaveBeenCalledWith(
      '/portfolios/prices/live',
      expect.objectContaining({ params: expect.any(URLSearchParams) }),
    );
    expect(result.prices['AAPL'].price).toBe(200);
    expect(result.prices['AAPL'].source).toBe('live');
  });

  it('getPortfolioPerformance fetches performance data without optional params', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockPerformance });
    const result = await getPortfolioPerformance(1);
    expect(spy).toHaveBeenCalledWith(
      '/portfolios/1/performance',
      expect.objectContaining({ params: {} }),
    );
    expect(result).toEqual(mockPerformance);
  });

  it('getPortfolioPerformance passes optional startDate, endDate, numPoints', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockPerformance });
    await getPortfolioPerformance(1, '2024-01-01', '2024-12-31', 100);
    expect(spy).toHaveBeenCalledWith(
      '/portfolios/1/performance',
      expect.objectContaining({
        params: { start_date: '2024-01-01', end_date: '2024-12-31', num_points: 100 },
      }),
    );
  });
});

describe('Transaction API functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getTransactions fetches paginated transactions', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockPaginatedResponse });
    const result = await getTransactions(1);
    expect(spy).toHaveBeenCalledWith(
      '/portfolios/1/transactions',
      expect.objectContaining({ params: expect.any(URLSearchParams) }),
    );
    expect(result.transactions).toHaveLength(1);
  });

  it('getTransactions passes ticker and type filters', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockPaginatedResponse });
    await getTransactions(1, 1, 20, 'AAPL', ['Buy'], 'asc');
    const params = spy.mock.calls[0][1]?.params as URLSearchParams;
    expect(params.get('ticker')).toBe('AAPL');
    expect(params.getAll('type')).toContain('Buy');
    expect(params.get('sort_order')).toBe('asc');
  });

  it('getTransactions omits sort_order param when desc (default)', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockPaginatedResponse });
    await getTransactions(1, 1, 20, undefined, undefined, 'desc');
    const params = spy.mock.calls[0][1]?.params as URLSearchParams;
    expect(params.get('sort_order')).toBeNull();
  });

  it('createTransaction posts and returns new transaction', async () => {
    const spy = vi.spyOn(apiInstance, 'post').mockResolvedValueOnce({ data: mockTransaction });
    const result = await createTransaction(1, {
      date: '2024-01-01',
      type: TransactionType.DEPOSIT,
      total_amount: 1000,
    });
    expect(spy).toHaveBeenCalledWith(
      '/portfolios/1/transactions/',
      expect.objectContaining({ total_amount: 1000 }),
    );
    expect(result).toEqual(mockTransaction);
  });

  it('updateTransaction sends PUT and returns updated transaction', async () => {
    const updated = { ...mockTransaction, total_amount: 2000 };
    const spy = vi.spyOn(apiInstance, 'put').mockResolvedValueOnce({ data: updated });
    const result = await updateTransaction(1, { total_amount: 2000 });
    expect(spy).toHaveBeenCalledWith('/transactions/1', { total_amount: 2000 });
    expect(result.total_amount).toBe(2000);
  });

  it('deleteTransaction sends DELETE', async () => {
    const spy = vi.spyOn(apiInstance, 'delete').mockResolvedValueOnce({ data: undefined });
    await deleteTransaction(1);
    expect(spy).toHaveBeenCalledWith('/transactions/1');
  });

  it('exportTransactionsCSV uses blob responseType and returns data', async () => {
    const mockBlob = new Blob(['csv'], { type: 'text/csv' });
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockBlob });
    const result = await exportTransactionsCSV(1);
    expect(spy).toHaveBeenCalledWith(
      '/portfolios/1/transactions/export',
      expect.objectContaining({ responseType: 'blob' }),
    );
    expect(result).toBe(mockBlob);
  });

  it('importTransactionsCSV posts FormData and returns BulkImportResponse', async () => {
    const importResponse = { imported_count: 3, skipped_count: 1, transactions: [] };
    const spy = vi.spyOn(apiInstance, 'post').mockResolvedValueOnce({ data: importResponse });
    const file = new File(['date,type'], 'data.csv', { type: 'text/csv' });
    const result = await importTransactionsCSV(1, file);
    expect(spy).toHaveBeenCalledWith(
      '/portfolios/1/transactions/import',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
    expect(result.imported_count).toBe(3);
  });
});

describe('Auth API functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getCurrentUser fetches and returns user', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: mockUser });
    const result = await getCurrentUser();
    expect(spy).toHaveBeenCalledWith('/users/me');
    expect(result).toEqual(mockUser);
  });

  it('login sends form-encoded credentials', async () => {
    const spy = vi.spyOn(apiInstance, 'post').mockResolvedValueOnce({ data: undefined });
    await login({ username: 'test@example.com', password: 'secret' });
    expect(spy).toHaveBeenCalledWith(
      '/auth/cookie/login',
      expect.any(URLSearchParams),
      expect.objectContaining({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
    );
  });

  it('register posts credentials and returns user', async () => {
    const spy = vi.spyOn(apiInstance, 'post').mockResolvedValueOnce({ data: mockUser });
    const result = await register({ email: 'test@example.com', password: 'secret', name: 'Test' });
    expect(spy).toHaveBeenCalledWith('/auth/register', {
      email: 'test@example.com',
      password: 'secret',
      name: 'Test',
    });
    expect(result.email).toBe('test@example.com');
  });

  it('logoutApi sends POST to logout endpoint', async () => {
    const spy = vi.spyOn(apiInstance, 'post').mockResolvedValueOnce({ data: undefined });
    await logoutApi();
    expect(spy).toHaveBeenCalledWith('/auth/cookie/logout');
  });

  it('updateUser sends PATCH with update data and returns updated user', async () => {
    const updated = { ...mockUser, name: 'Updated Name' };
    const spy = vi.spyOn(apiInstance, 'patch').mockResolvedValueOnce({ data: updated });
    const result = await updateUser({ name: 'Updated Name' });
    expect(spy).toHaveBeenCalledWith('/users/me', { name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('closeAccount sends DELETE with request body', async () => {
    const spy = vi.spyOn(apiInstance, 'delete').mockResolvedValueOnce({ data: undefined });
    await closeAccount({ password: 'secret', confirmation: 'DELETE' });
    expect(spy).toHaveBeenCalledWith(
      '/users/me',
      expect.objectContaining({ data: { password: 'secret', confirmation: 'DELETE' } }),
    );
  });

  it('getGoogleAuthorizeUrl fetches and returns authorization URL', async () => {
    const spy = vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({
      data: { authorization_url: 'https://accounts.google.com/o/oauth2/auth?...' },
    });
    const result = await getGoogleAuthorizeUrl();
    expect(spy).toHaveBeenCalledWith('/auth/google/authorize');
    expect(result).toBe('https://accounts.google.com/o/oauth2/auth?...');
  });
});
