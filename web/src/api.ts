import axios from 'axios';
import { z } from 'zod';
import { parseOrThrow } from './api-error';
import type { components } from './api-generated';

// Backend-defined schemas, generated from FastAPI's OpenAPI document.
// Run ``npm run generate:api`` after changing the backend Pydantic models.
type schemas = components['schemas'];

// ================== Enums / literals ==================

export enum TransactionType {
  DEPOSIT = 'Deposit',
  BUY = 'Buy',
  FEE = 'Fee',
  SELL = 'Sell',
  WITHDRAW = 'Withdraw',
  SPLIT = 'Split',
  DIVIDEND = 'Dividend',
}

const TransactionTypeSchema = z.enum(TransactionType);

const PriceSourceSchema = z.enum(['live', 'last_known', 'missing']);
export type PriceSource = z.infer<typeof PriceSourceSchema>;

// ================== Response schemas (backend → client) ==================
//
// These schemas are the runtime contract. Every API function that returns
// a typed response parses through one of these at the fetch boundary — a
// backend drift (renamed or re-typed field) becomes an ``ApiContractError``
// at the edge rather than an ``undefined`` surprise deep in a render.
//
// The exported types are derived via ``z.infer`` so type and runtime shape
// cannot drift apart client-side. Request-side types (form payloads) are
// kept as plain interfaces — they're validated by the backend, not here.

const UserReadSchema = z.object({
  id: z.string(),
  email: z.string(),
  is_active: z.boolean(),
  is_superuser: z.boolean(),
  is_verified: z.boolean(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
  oauth_providers: z.array(z.string()),
  tax_rate: z.number(),
});
export type UserRead = z.infer<typeof UserReadSchema>;

const PortfolioSchema = z.object({
  id: z.number(),
  name: z.string(),
  created_at: z.string(),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

const TransactionSchema = z.object({
  id: z.number(),
  portfolio_id: z.number(),
  date: z.string(),
  type: TransactionTypeSchema,
  ticker: z.string().nullish(),
  quantity: z.number().nullish(),
  price_per_share: z.number().nullish(),
  fee: z.number().nullish(),
  total_amount: z.number(),
  eur_amount: z.number().nullish(),
  split_ratio: z.number().nullish(),
  currency: z.string().nullish(),
  fx_rate: z.number().nullish(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

const BulkImportResponseSchema = z.object({
  imported_count: z.number(),
  skipped_count: z.number(),
  transactions: z.array(TransactionSchema),
  // Optional for forward compat; default false matches a real (non-dry-run)
  // import. When true, ``transactions`` is empty and the counts are
  // projections of what *would* be imported.
  dry_run: z.boolean().default(false),
});
export type BulkImportResponse = z.infer<typeof BulkImportResponseSchema>;

const PaginatedTransactionResponseSchema = z.object({
  transactions: z.array(TransactionSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  total_pages: z.number(),
});
export type PaginatedTransactionResponse = z.infer<
  typeof PaginatedTransactionResponseSchema
>;

const HoldingSchema = z.object({
  ticker: z.string(),
  quantity: z.number(),
  average_cost: z.number(),
  total_cost: z.number(),
  first_buy_date: z.string(),
});
export type Holding = z.infer<typeof HoldingSchema>;

export const PricedHoldingSchema = HoldingSchema.extend({
  current_price: z.number().nullable(),
  current_value: z.number().nullable(),
  unrealized_gain_loss: z.number().nullable(),
  unrealized_gain_loss_pct: z.number().nullable(),
  price_source: PriceSourceSchema,
  price_as_of: z.string().nullable(),
});
export type PricedHolding = z.infer<typeof PricedHoldingSchema>;

const RealizedSaleSchema = z.object({
  ticker: z.string(),
  date: z.string(),
  quantity: z.number(),
  quantity_before: z.number(),
  proceeds: z.number(),
  cost_basis: z.number(),
  realized_gain: z.number(),
  first_buy_date: z.string(),
});
export type RealizedSale = z.infer<typeof RealizedSaleSchema>;

const DividendReceivedSchema = z.object({
  ticker: z.string(),
  date: z.string(),
  amount: z.number(),
  amount_eur: z.number().nullable(),
});
export type DividendReceived = z.infer<typeof DividendReceivedSchema>;

const WithdrawalFxSchema = z.object({
  date: z.string(),
  amount: z.number(),
  // Nullable when the historical FX rate or running EUR principal was
  // unavailable — the backend never silently substitutes today's rate.
  amount_eur_avg: z.number().nullable(),
  amount_eur: z.number().nullable(),
  realized_fx_gain: z.number().nullable(),
});
export type WithdrawalFx = z.infer<typeof WithdrawalFxSchema>;

const TransactionWarningSchema = z.object({
  code: z.string(),
  date: z.string(),
  params: z.record(z.string(), z.string()),
});
export type TransactionWarning = z.infer<typeof TransactionWarningSchema>;

const PortfolioStatusSchema = z.object({
  portfolio_id: z.number(),
  portfolio_name: z.string(),
  principal: z.number(),
  // EUR aggregates are nullable: when any contributing transaction lacks a
  // usable historical FX rate, the aggregate is reported as null instead of
  // silently distorted by today's live rate. ``eur_incomplete`` is the
  // ergonomic OR-flag; ``fx_missing_tx_ids`` lists the offenders.
  principal_eur: z.number().nullable(),
  principal_eur_avg: z.number().nullable(),
  dividends: z.number(),
  dividends_eur: z.number().nullable(),
  cash: z.number(),
  holdings: z.array(HoldingSchema),
  holdings_cost: z.number(),
  realized_gains: z.number(),
  realized_sales: z.array(RealizedSaleSchema),
  dividends_received: z.array(DividendReceivedSchema),
  realized_withdrawals: z.array(WithdrawalFxSchema),
  capital_gains_tax_rate: z.number(),
  warnings: z.array(TransactionWarningSchema),
  usd_to_eur_rate: z.number().nullable(),
  eur_incomplete: z.boolean().default(false),
  fx_missing_tx_ids: z.array(z.number()).default([]),
  // Default keeps fixtures and older API responses parseable while we
  // roll out the field; the backend always populates it.
  transaction_count: z.number().int().nonnegative().default(0),
});
export type PortfolioStatus = z.infer<typeof PortfolioStatusSchema>;

// PricedPortfolioStatus is client-computed (not a server response), so it
// stays as a plain type derived from PortfolioStatus + live-price overlays.
export interface PricedPortfolioStatus extends Omit<PortfolioStatus, 'holdings'> {
  holdings: PricedHolding[];
  current_value: number | null;
  holdings_value: number | null;
  unrealized_gains: number | null;
  unrealized_gains_pct: number | null;
  missing_prices: string[];
}

const PerformanceDataPointSchema = z.object({
  date: z.string(),
  principal: z.number(),
  principal_eur: z.number().nullable(),
  current_value: z.number().nullable(),
  fx_rate: z.number().nullable(),
  return_pct: z.number().nullable(),
  sp500_return_pct: z.number().nullable(),
});
export type PerformanceDataPoint = z.infer<typeof PerformanceDataPointSchema>;

const PortfolioPerformanceSchema = z.object({
  portfolio_id: z.number(),
  portfolio_name: z.string(),
  data_points: z.array(PerformanceDataPointSchema),
  // Added in Package B.1 — tickers whose historical prices were unavailable
  // and which were therefore valued at cost basis. Default-empty so old
  // fixtures without the field still parse.
  cost_basis_fallback_tickers: z.array(z.string()).default([]),
  // Transaction-replay warnings collected while reconstructing the historical
  // series (e.g. oversell, sell-of-non-held). Default-empty for forward
  // compat with older backends.
  warnings: z.array(TransactionWarningSchema).default([]),
});
export type PortfolioPerformance = z.infer<typeof PortfolioPerformanceSchema>;

const LivePriceInfoSchema = z.object({
  price: z.number().nullable(),
  source: PriceSourceSchema,
  as_of: z.string().nullable(),
});
export type LivePriceInfo = z.infer<typeof LivePriceInfoSchema>;

const LivePricesSchema = z.object({
  prices: z.record(z.string(), LivePriceInfoSchema),
  usd_to_eur_rate: z.number().nullable(),
  timestamp: z.string(),
  // Optional for forward compatibility with older backends. When true the
  // upstream Yahoo Finance circuit breaker is open and prices will mostly
  // come from the DB cache or be missing.
  provider_unavailable: z.boolean().default(false),
});
export type LivePrices = z.infer<typeof LivePricesSchema>;

const GoogleAuthorizeUrlSchema = z.object({
  authorization_url: z.string(),
});

// ================== Request-side types (client → backend) ==================
// Sourced from the backend OpenAPI schema where a 1:1 generated equivalent
// exists. Kept as plain interfaces only for FastAPI-Users form payloads
// that don't get a named schema (login/register).

export type UserUpdate = schemas['UserUpdate'];
export type CloseAccountRequest = schemas['CloseAccountRequest'];
export type PortfolioCreate = schemas['PortfolioCreate'];
export type PortfolioUpdate = schemas['PortfolioUpdate'];
export type PortfolioCopy = schemas['PortfolioCopy'];
export type TransactionCreate = schemas['TransactionCreate'];
export type TransactionUpdate = schemas['TransactionUpdate'];

export interface LoginCredentials {
  username: string; // FastAPI Users uses "username" field (which is the email)
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

// ================== API Configuration ==================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Send httpOnly cookies automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tracks whether a session has been confirmed via getCurrentUser().
// The 401 interceptor only fires auth:logout once a session is confirmed, preventing
// spurious queryClient.clear() calls on the initial unauthenticated page probe.
let sessionActive = false;

// 401 interceptor — fires auth:logout event so AuthContext can react
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && sessionActive) {
      sessionActive = false;
      globalThis.dispatchEvent(new CustomEvent('auth:logout'));
    }
    return Promise.reject(error);
  }
);

// ================== Auth API Functions ==================

export const login = async (credentials: LoginCredentials): Promise<void> => {
  // FastAPI Users login requires application/x-www-form-urlencoded with field "username"
  const params = new URLSearchParams();
  params.append('username', credentials.username);
  params.append('password', credentials.password);
  await api.post('/auth/cookie/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};

export const register = async (credentials: RegisterCredentials): Promise<UserRead> => {
  const response = await api.post('/auth/register', credentials);
  return parseOrThrow(UserReadSchema, response.data, 'POST /auth/register');
};

export const logoutApi = async (): Promise<void> => {
  sessionActive = false; // Clear before request so any 401 response doesn't re-trigger the event
  await api.post('/auth/cookie/logout');
};

export const getCurrentUser = async (): Promise<UserRead> => {
  const response = await api.get('/users/me');
  const user = parseOrThrow(UserReadSchema, response.data, 'GET /users/me');
  sessionActive = true; // Session confirmed
  return user;
};

export const getGoogleAuthorizeUrl = async (): Promise<string> => {
  const response = await api.get('/auth/google/authorize');
  const parsed = parseOrThrow(
    GoogleAuthorizeUrlSchema,
    response.data,
    'GET /auth/google/authorize',
  );
  return parsed.authorization_url;
};

export const updateUser = async (data: UserUpdate): Promise<UserRead> => {
  const response = await api.patch('/users/me', data);
  return parseOrThrow(UserReadSchema, response.data, 'PATCH /users/me');
};

export const closeAccount = async (data: CloseAccountRequest): Promise<void> => {
  await api.delete('/users/me', { data });
};

// ================== Portfolio API Functions ==================

/**
 * Get all portfolios
 */
export const getPortfolios = async (): Promise<Portfolio[]> => {
  const response = await api.get('/portfolios/');
  return parseOrThrow(z.array(PortfolioSchema), response.data, 'GET /portfolios/');
};

/**
 * Create a new portfolio
 */
export const createPortfolio = async (portfolio: PortfolioCreate): Promise<Portfolio> => {
  const response = await api.post('/portfolios/', portfolio);
  return parseOrThrow(PortfolioSchema, response.data, 'POST /portfolios/');
};

/**
 * Update a portfolio
 */
export const updatePortfolio = async (
  portfolioId: number,
  portfolio: PortfolioUpdate
): Promise<Portfolio> => {
  const response = await api.put(`/portfolios/${portfolioId}`, portfolio);
  return parseOrThrow(
    PortfolioSchema,
    response.data,
    `PUT /portfolios/${portfolioId}`,
  );
};

/**
 * Delete a portfolio
 */
export const deletePortfolio = async (portfolioId: number): Promise<void> => {
  await api.delete(`/portfolios/${portfolioId}`);
};

/**
 * Copy a portfolio with all its transactions
 */
export const copyPortfolio = async (
  portfolioId: number,
  data: PortfolioCopy
): Promise<Portfolio> => {
  const response = await api.post(`/portfolios/${portfolioId}/copy`, data);
  return parseOrThrow(
    PortfolioSchema,
    response.data,
    `POST /portfolios/${portfolioId}/copy`,
  );
};

/**
 * Get portfolio status with holdings, cash balance, and performance metrics
 */
export const getPortfolioStatus = async (portfolioId: number): Promise<PortfolioStatus> => {
  const response = await api.get(`/portfolios/${portfolioId}/status`);
  return parseOrThrow(
    PortfolioStatusSchema,
    response.data,
    `GET /portfolios/${portfolioId}/status`,
  );
};

/**
 * Get live prices and FX rate (lightweight, no transaction replay)
 */
export const getLivePrices = async (tickers: string[]): Promise<LivePrices> => {
  const params = new URLSearchParams();
  tickers.forEach((t) => params.append('tickers', t));
  const response = await api.get('/portfolios/prices/live', { params });
  return parseOrThrow(LivePricesSchema, response.data, 'GET /portfolios/prices/live');
};

interface PerformanceParams {
  start_date?: string;
  end_date?: string;
  num_points?: number;
}

/**
 * Get portfolio performance over time
 */
export const getPortfolioPerformance = async (
  portfolioId: number,
  startDate?: string,
  endDate?: string,
  numPoints?: number
): Promise<PortfolioPerformance> => {
  const params: PerformanceParams = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (numPoints) params.num_points = numPoints;

  const response = await api.get(`/portfolios/${portfolioId}/performance`, { params });
  return parseOrThrow(
    PortfolioPerformanceSchema,
    response.data,
    `GET /portfolios/${portfolioId}/performance`,
  );
};

// ================== Transaction API Functions ==================

/**
 * Get paginated transactions for a portfolio
 */
export const getTransactions = async (
  portfolioId: number,
  page: number = 1,
  pageSize: number = 20,
  ticker?: string,
  types?: string[],
  sortOrder: 'asc' | 'desc' = 'desc'
): Promise<PaginatedTransactionResponse> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('page_size', String(pageSize));
  if (ticker) params.append('ticker', ticker);
  if (types) types.forEach((t) => params.append('type', t));
  if (sortOrder !== 'desc') params.append('sort_order', sortOrder);

  const response = await api.get(`/portfolios/${portfolioId}/transactions`, { params });
  return parseOrThrow(
    PaginatedTransactionResponseSchema,
    response.data,
    `GET /portfolios/${portfolioId}/transactions`,
  );
};

/**
 * Create a new transaction for a portfolio
 */
export const createTransaction = async (
  portfolioId: number,
  transaction: TransactionCreate
): Promise<Transaction> => {
  const response = await api.post(
    `/portfolios/${portfolioId}/transactions/`,
    transaction
  );
  return parseOrThrow(
    TransactionSchema,
    response.data,
    `POST /portfolios/${portfolioId}/transactions/`,
  );
};

/**
 * Update a transaction
 */
export const updateTransaction = async (
  transactionId: number,
  transaction: TransactionUpdate
): Promise<Transaction> => {
  const response = await api.put(`/transactions/${transactionId}`, transaction);
  return parseOrThrow(
    TransactionSchema,
    response.data,
    `PUT /transactions/${transactionId}`,
  );
};

/**
 * Delete a transaction
 */
export const deleteTransaction = async (transactionId: number): Promise<void> => {
  await api.delete(`/transactions/${transactionId}`);
};

/**
 * Export transactions to CSV
 */
export const exportTransactionsCSV = async (portfolioId: number): Promise<Blob> => {
  const response = await api.get(`/portfolios/${portfolioId}/transactions/export`, {
    responseType: 'blob',
  });
  return response.data;
};

// ================== CSV Upload ==================

/**
 * Import a CSV file to add transactions to a portfolio.
 *
 * When ``dryRun`` is true the backend parses + dedups but does not write,
 * returning projected counts so the UI can confirm before committing.
 */
export const importTransactionsCSV = async (
  portfolioId: number,
  file: File,
  options: { dryRun?: boolean } = {},
): Promise<BulkImportResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post(
    `/portfolios/${portfolioId}/transactions/import`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params: options.dryRun ? { dry_run: 'true' } : undefined,
    }
  );
  return parseOrThrow(
    BulkImportResponseSchema,
    response.data,
    `POST /portfolios/${portfolioId}/transactions/import`,
  );
};

// ================== Error Handling ==================

/**
 * API Error type — matches FastAPI's 4xx/5xx error body shape.
 */
export interface ApiError {
  detail: string;
}

/**
 * Check if an error is an API error
 */
export const isApiError = (error: unknown): error is { response: { data: ApiError } } => {
  return (
    axios.isAxiosError(error) &&
    error.response !== undefined &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'detail' in error.response.data
  );
};

/**
 * Extract error message from API error
 */
export const getErrorMessage = (error: unknown): string => {
  if (isApiError(error)) {
    return error.response.data.detail;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};

export default api;
