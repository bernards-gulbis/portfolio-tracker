import { describe, it, expect } from 'vitest';
import axios from 'axios';
import type { AxiosHeaders } from 'axios';
import { isApiError, getErrorMessage, TransactionType } from '../api';

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
