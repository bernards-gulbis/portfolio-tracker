import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import * as api from '../api';
import type { UserRead } from '../api';

const mockQueryClient = { clear: vi.fn() };

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return { ...actual, useQueryClient: () => mockQueryClient };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return { ...actual, getCurrentUser: vi.fn(), logoutApi: vi.fn() };
});

const mockUser: UserRead = {
  id: 'user-123',
  email: 'user@example.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
  name: null,
  oauth_providers: [],
};

// Renders AuthProvider with a simple consumer component
const StatusDisplay = () => {
  const { user, status } = useAuth();
  return (
    <>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
    </>
  );
};

const renderAuth = (children?: React.ReactNode) =>
  render(
    <AuthProvider>
      <StatusDisplay />
      {children}
    </AuthProvider>
  );

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClient.clear.mockReset();
  });

  it('starts in loading state before getCurrentUser resolves', () => {
    vi.mocked(api.getCurrentUser).mockImplementation(() => new Promise(() => {}));
    renderAuth();
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
  });

  it('sets authenticated status when getCurrentUser succeeds', async () => {
    vi.mocked(api.getCurrentUser).mockResolvedValueOnce(mockUser);
    renderAuth();

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    );
    expect(screen.getByTestId('email')).toHaveTextContent('user@example.com');
  });

  it('sets unauthenticated status when getCurrentUser fails', async () => {
    vi.mocked(api.getCurrentUser).mockRejectedValueOnce(new Error('Unauthorized'));
    renderAuth();

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    );
    expect(screen.getByTestId('email')).toHaveTextContent('none');
  });

  it('clears user and calls queryClient.clear() on auth:logout event', async () => {
    vi.mocked(api.getCurrentUser).mockResolvedValueOnce(mockUser);
    renderAuth();

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('auth:logout'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    );
    expect(screen.getByTestId('email')).toHaveTextContent('none');
    expect(mockQueryClient.clear).toHaveBeenCalled();
  });

  describe('logout()', () => {
    const LogoutButton = () => {
      const { logout } = useAuth();
      return <button onClick={logout}>Logout</button>;
    };

    it('calls logoutApi, clears state, and calls queryClient.clear()', async () => {
      vi.mocked(api.getCurrentUser).mockResolvedValueOnce(mockUser);
      vi.mocked(api.logoutApi).mockResolvedValueOnce(undefined);

      renderAuth(<LogoutButton />);
      await waitFor(() =>
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      );

      await userEvent.click(screen.getByRole('button', { name: 'Logout' }));

      await waitFor(() => {
        expect(api.logoutApi).toHaveBeenCalled();
        expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
        expect(mockQueryClient.clear).toHaveBeenCalled();
      });
    });

    it('clears state even when logoutApi throws', async () => {
      vi.mocked(api.getCurrentUser).mockResolvedValueOnce(mockUser);
      vi.mocked(api.logoutApi).mockRejectedValueOnce(new Error('Network error'));

      renderAuth(<LogoutButton />);
      await waitFor(() =>
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      );

      await userEvent.click(screen.getByRole('button', { name: 'Logout' }));

      await waitFor(() =>
        expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
      );
    });
  });
});
