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
  date_time: string;
  type: TransactionType;
  ticker?: string | null;
  units?: number | null;
  price?: number | null;
  fee: number;
  value: number;
  value_eur?: number | null;
  split_ratio?: number | null;
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
  date_time: string;
  type: TransactionType;
  ticker?: string | null;
  units?: number | null;
  price?: number | null;
  fee?: number;
  value: number;
  value_eur?: number | null;
  split_ratio?: number | null;
}

export interface TransactionUpdate {
  date_time?: string;
  type?: TransactionType;
  ticker?: string | null;
  units?: number | null;
  price?: number | null;
  fee?: number;
  value?: number;
  value_eur?: number | null;
  split_ratio?: number | null;
}

export interface BulkImportResponse {
  imported_count: number;
  transactions: Transaction[];
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

// ================== Transaction API Functions ==================

/**
 * Get all transactions for a portfolio
 */
export const getTransactions = async (portfolioId: number): Promise<Transaction[]> => {
  const response = await api.get<Transaction[]>(`/portfolios/${portfolioId}/transactions`);
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
    `/portfolios/${portfolioId}/import`,
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
