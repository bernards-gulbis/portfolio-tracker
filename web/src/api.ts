import axios from 'axios';

// ================== Types/Interfaces ==================

export enum TransactionType {
  DEPOSIT = 'Deposit',
  BUY = 'Buy',
  FEE = 'Fee',
  SELL = 'Sell',
  WITHDRAW = 'Withdraw',
  SPLIT = 'Split',
  DIVIDEND = 'Dividend',
}

export interface UserRead {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  name: string | null;
  picture: string | null;
  oauth_providers: string[];
  tax_rate: number;
}

export interface UserUpdate {
  name?: string;
  password?: string;
  tax_rate?: number;
}

export interface CloseAccountRequest {
  password?: string;
  confirmation?: string;
}

export interface LoginCredentials {
  username: string; // FastAPI Users uses "username" field (which is the email)
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

export interface Portfolio {
  id: number;
  name: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  portfolio_id: number;
  date: string;
  type: TransactionType;
  ticker?: string | null;
  quantity?: number | null;
  price_per_share?: number | null;
  fee?: number | null;
  total_amount: number;
  eur_amount?: number | null;
  split_ratio?: number | null;
  currency?: string | null;
  fx_rate?: number | null;
}

export interface PortfolioCreate {
  name: string;
}

export interface PortfolioUpdate {
  name: string;
}

export interface PortfolioCopy {
  new_name: string;
}

export interface TransactionCreate {
  date: string;
  type: TransactionType;
  ticker?: string | null;
  quantity?: number | null;
  price_per_share?: number | null;
  fee?: number | null;
  total_amount: number;
  eur_amount?: number | null;
  split_ratio?: number | null;
  currency?: string | null;
  fx_rate?: number | null;
}

export interface TransactionUpdate {
  date?: string;
  type?: TransactionType;
  ticker?: string | null;
  quantity?: number | null;
  price_per_share?: number | null;
  fee?: number | null;
  total_amount?: number;
  eur_amount?: number | null;
  split_ratio?: number | null;
  currency?: string | null;
  fx_rate?: number | null;
}

export interface BulkImportResponse {
  imported_count: number;
  transactions: Transaction[];
}

export interface PaginatedTransactionResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface Holding {
  ticker: string;
  quantity: number;
  average_cost: number;
  total_cost: number;
  current_price?: number | null;
  current_value?: number | null;
  unrealized_gain_loss?: number | null;
  unrealized_gain_loss_pct?: number | null;
}

export interface TransactionWarning {
  code: string;
  date: string;
  params: Record<string, string>;
}

export interface PortfolioStatus {
  portfolio_id: number;
  portfolio_name: string;
  current_value: number;
  principal: number;
  principal_eur: number;
  dividends: number;
  dividends_eur: number | null;
  cash: number;
  holdings: Holding[];
  holdings_cost: number;
  holdings_value: number;
  unrealized_gains: number;
  unrealized_gains_pct: number | null;
  realized_gains: number;
  capital_gains_tax_rate: number;
  missing_prices: string[];
  warnings: TransactionWarning[];
  usd_to_eur_rate: number | null;
}

export interface PerformanceDataPoint {
  date: string;
  principal: number;
  principal_eur: number | null;
  current_value: number | null;
  fx_rate: number | null;
  return_pct: number | null;
  sp500_return_pct: number | null;
}

export interface PortfolioPerformance {
  portfolio_id: number;
  portfolio_name: string;
  data_points: PerformanceDataPoint[];
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
  const response = await api.post<UserRead>('/auth/register', credentials);
  return response.data;
};

export const logoutApi = async (): Promise<void> => {
  sessionActive = false; // Clear before request so any 401 response doesn't re-trigger the event
  await api.post('/auth/cookie/logout');
};

export const getCurrentUser = async (): Promise<UserRead> => {
  const response = await api.get<UserRead>('/users/me');
  sessionActive = true; // Session confirmed
  return response.data;
};

export const getGoogleAuthorizeUrl = async (): Promise<string> => {
  const response = await api.get<{ authorization_url: string }>('/auth/google/authorize');
  return response.data.authorization_url;
};

export const updateUser = async (data: UserUpdate): Promise<UserRead> => {
  const response = await api.patch<UserRead>('/users/me', data);
  return response.data;
};

export const closeAccount = async (data: CloseAccountRequest): Promise<void> => {
  await api.delete('/users/me', { data });
};

// ================== Portfolio API Functions ==================

/**
 * Get all portfolios
 */
export const getPortfolios = async (): Promise<Portfolio[]> => {
  const response = await api.get<Portfolio[]>('/portfolios/');
  return response.data;
};

/**
 * Create a new portfolio
 */
export const createPortfolio = async (portfolio: PortfolioCreate): Promise<Portfolio> => {
  const response = await api.post<Portfolio>('/portfolios/', portfolio);
  return response.data;
};

/**
 * Update a portfolio
 */
export const updatePortfolio = async (
  portfolioId: number,
  portfolio: PortfolioUpdate
): Promise<Portfolio> => {
  const response = await api.put<Portfolio>(`/portfolios/${portfolioId}`, portfolio);
  return response.data;
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
  const response = await api.post<Portfolio>(
    `/portfolios/${portfolioId}/copy`,
    data
  );
  return response.data;
};

/**
 * Get portfolio status with holdings, cash balance, and performance metrics
 */
export const getPortfolioStatus = async (portfolioId: number): Promise<PortfolioStatus> => {
  const response = await api.get<PortfolioStatus>(`/portfolios/${portfolioId}/status`);
  return response.data;
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

  const response = await api.get<PortfolioPerformance>(
    `/portfolios/${portfolioId}/performance`,
    { params }
  );
  return response.data;
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

  const response = await api.get<PaginatedTransactionResponse>(
    `/portfolios/${portfolioId}/transactions`,
    { params }
  );
  return response.data;
};

/**
 * Create a new transaction for a portfolio
 */
export const createTransaction = async (
  portfolioId: number,
  transaction: TransactionCreate
): Promise<Transaction> => {
  const response = await api.post<Transaction>(
    `/portfolios/${portfolioId}/transactions/`,
    transaction
  );
  return response.data;
};

/**
 * Update a transaction
 */
export const updateTransaction = async (
  transactionId: number,
  transaction: TransactionUpdate
): Promise<Transaction> => {
  const response = await api.put<Transaction>(`/transactions/${transactionId}`, transaction);
  return response.data;
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
 * Import a CSV file to add transactions to a portfolio
 */
export const importTransactionsCSV = async (
  portfolioId: number,
  file: File
): Promise<BulkImportResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<BulkImportResponse>(
    `/portfolios/${portfolioId}/transactions/import`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

// ================== Error Handling ==================

/**
 * API Error type
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
