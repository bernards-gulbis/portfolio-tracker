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

export interface Portfolio {
  id: number;
  name: string;
  created_at: string;
}

export interface PortfolioWithTransactions extends Portfolio {
  transactions: Transaction[];
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
  unrealized_gain_loss_percent?: number | null;
}

export interface PortfolioStatus {
  portfolio_id: number;
  portfolio_name: string;
  current_value: number;
  current_value_eur: number | null;
  principal: number;
  principal_eur: number;
  dividends: number;
  dividends_eur: number | null;
  cash: number;
  holdings: Holding[];
  holdings_cost: number;
  holdings_value: number;
  unrealized_gains: number;
  unrealized_gains_percent: number | null;
  unrealized_gains_eur: number | null;
  realized_gains: number;
  tax_eur: number | null;
  total_return_after_tax_eur: number | null;
  total_return_after_tax_percent: number | null;
  current_value_after_tax_eur: number | null;
}

// ================== API Configuration ==================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ================== Portfolio API Functions ==================

/**
 * Get all portfolios
 */
export const getPortfolios = async (): Promise<Portfolio[]> => {
  const response = await api.get<Portfolio[]>('/portfolios/');
  return response.data;
};

/**
 * Get a specific portfolio with its transactions
 */
export const getPortfolio = async (portfolioId: number): Promise<PortfolioWithTransactions> => {
  const response = await api.get<PortfolioWithTransactions>(`/portfolios/${portfolioId}`);
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
  newName: string
): Promise<Portfolio> => {
  const response = await api.post<Portfolio>(
    `/portfolios/${portfolioId}/copy`,
    { new_name: newName }
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

// ================== Transaction API Functions ==================

/**
 * Get paginated transactions for a portfolio
 */
export const getTransactions = async (
  portfolioId: number,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedTransactionResponse> => {
  const response = await api.get<PaginatedTransactionResponse>(
    `/portfolios/${portfolioId}/transactions`,
    {
      params: { page, page_size: pageSize }
    }
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
