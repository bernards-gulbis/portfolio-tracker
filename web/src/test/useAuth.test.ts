import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '../api';
import { useAuth } from '../context/AuthContext';
import { useLogin, useRegister, useLogout } from '../hooks/useAuth';
import type { UserRead } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn(),
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockUser: UserRead = {
  id: 'user-123',
  email: 'user@example.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
  name: null,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

// ── useLogin ──────────────────────────────────────────────────────────────────────────────

describe('useLogin', () => {
  const mockSetUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      setUser: mockSetUser,
      logout: vi.fn(),
      user: null,
      status: 'unauthenticated',
    });
  });

  it('calls login then getCurrentUser', async () => {
    vi.mocked(api.login).mockResolvedValueOnce(undefined);
    vi.mocked(api.getCurrentUser).mockResolvedValueOnce(mockUser);

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ username: 'user@example.com', password: 'pass' });

    expect(api.login).toHaveBeenCalledWith({ username: 'user@example.com', password: 'pass' });
    expect(api.getCurrentUser).toHaveBeenCalled();
  });

  it('calls setUser with the fetched user on success', async () => {
    vi.mocked(api.login).mockResolvedValueOnce(undefined);
    vi.mocked(api.getCurrentUser).mockResolvedValueOnce(mockUser);

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ username: 'user@example.com', password: 'pass' });

    await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith(mockUser));
  });

  it('shows Welcome back! toast on success', async () => {
    vi.mocked(api.login).mockResolvedValueOnce(undefined);
    vi.mocked(api.getCurrentUser).mockResolvedValueOnce(mockUser);

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ username: 'user@example.com', password: 'pass' });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Welcome back!'));
  });

  it('propagates login errors without calling setUser', async () => {
    vi.mocked(api.login).mockRejectedValueOnce(new Error('Invalid credentials'));

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });
    await expect(
      result.current.mutateAsync({ username: 'x', password: 'y' })
    ).rejects.toThrow('Invalid credentials');

    expect(mockSetUser).not.toHaveBeenCalled();
  });
});

// ── useRegister ───────────────────────────────────────────────────────────────────────────

describe('useRegister', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      setUser: vi.fn(),
      logout: vi.fn(),
      user: null,
      status: 'unauthenticated',
    });
  });

  it('calls register API with credentials and returns UserRead', async () => {
    vi.mocked(api.register).mockResolvedValueOnce(mockUser);

    const { result } = renderHook(() => useRegister(), { wrapper: createWrapper() });
    const data = await result.current.mutateAsync({
      name: 'New User',
      email: 'new@example.com',
      password: 'pass123',
    });

    expect(api.register).toHaveBeenCalledWith({ name: 'New User', email: 'new@example.com', password: 'pass123' });
    expect(data).toEqual(mockUser);
  });

  it('propagates registration errors', async () => {
    vi.mocked(api.register).mockRejectedValueOnce(new Error('Email already in use'));

    const { result } = renderHook(() => useRegister(), { wrapper: createWrapper() });
    await expect(
      result.current.mutateAsync({ name: 'Taken User', email: 'taken@example.com', password: 'pass123' })
    ).rejects.toThrow('Email already in use');
  });
});

// ── useLogout ─────────────────────────────────────────────────────────────────────────────

describe('useLogout', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      setUser: vi.fn(),
      logout: mockLogout,
      user: mockUser,
      status: 'authenticated',
    });
  });

  it('calls the logout function from AuthContext', async () => {
    mockLogout.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });
    await result.current.mutateAsync();

    expect(mockLogout).toHaveBeenCalled();
  });

  it('shows Logged out toast on success', async () => {
    mockLogout.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });
    await result.current.mutateAsync();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Logged out'));
  });

  it('propagates logout errors', async () => {
    mockLogout.mockRejectedValueOnce(new Error('Session already expired'));

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });
    await expect(result.current.mutateAsync()).rejects.toThrow('Session already expired');
  });
});