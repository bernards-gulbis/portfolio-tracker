import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import * as api from '../api';
import { useLogin, useRegister } from '../hooks/useAuth';
import { LoginPage } from '../components/LoginPage';

vi.mock('../hooks/useAuth', () => ({
  useLogin: vi.fn(),
  useRegister: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({})),
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })),
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return { ...actual, getGoogleAuthorizeUrl: vi.fn() };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('LoginPage', () => {
  const mockLoginMutateAsync = vi.fn();
  const mockRegisterMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLogin).mockReturnValue({
      mutateAsync: mockLoginMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useLogin>);
    vi.mocked(useRegister).mockReturnValue({
      mutateAsync: mockRegisterMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useRegister>);
  });

  const renderPage = () => render(<LoginPage />);

  // ── Initial render ──────────────────────────────────────────────

  it('shows Sign In title by default', () => {
    renderPage();
    expect(screen.getByText('Sign In', { selector: '[data-slot="card-title"]' })).toBeInTheDocument();
  });

  it('renders email and password fields', () => {
    renderPage();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders Continue with Google button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  // ── Mode switching ────────────────────────────────────────────

  it('switches to Create Account mode when Sign up is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByText('Create Account', { selector: '[data-slot="card-title"]' })).toBeInTheDocument();
  });

  it('switches back to Sign In mode when Sign in is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Sign In', { selector: '[data-slot="card-title"]' })).toBeInTheDocument();
  });

  // ── Login form ──────────────────────────────────────────────────

  it('calls login mutation with username and password', async () => {
    mockLoginMutateAsync.mockResolvedValueOnce(undefined);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockLoginMutateAsync).toHaveBeenCalledWith({
        username: 'user@example.com',
        password: 'password123',
      });
    });
  });

  it('shows validation error for invalid email format', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Email'), 'notanemail');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() =>
      expect(screen.getByText('Invalid email address')).toBeInTheDocument()
    );
    expect(mockLoginMutateAsync).not.toHaveBeenCalled();
  });

  it('shows validation error when password is empty', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() =>
      expect(screen.getByText('Password is required')).toBeInTheDocument()
    );
    expect(mockLoginMutateAsync).not.toHaveBeenCalled();
  });

  it('shows inline API error on login failure', async () => {
    mockLoginMutateAsync.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderPage();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() =>
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    );
  });

  // ── Register form ───────────────────────────────────────────────

  it('calls register mutation with email and password', async () => {
    mockRegisterMutateAsync.mockResolvedValueOnce({
      id: '1', email: 'new@example.com', is_active: true, is_superuser: false, is_verified: false,
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(mockRegisterMutateAsync).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
      })
    );
  });

  it('shows error for password shorter than 8 characters on register', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    );
    expect(mockRegisterMutateAsync).not.toHaveBeenCalled();
  });

  it('shows success toast and switches to login mode after registration', async () => {
    mockRegisterMutateAsync.mockResolvedValueOnce({
      id: '1', email: 'new@example.com', is_active: true, is_superuser: false, is_verified: false,
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Account created! Please log in.');
      expect(screen.getByText('Sign In', { selector: '[data-slot="card-title"]' })).toBeInTheDocument();
    });
  });

  it('prefills email in login form after successful registration', async () => {
    mockRegisterMutateAsync.mockResolvedValueOnce({
      id: '1', email: 'new@example.com', is_active: true, is_superuser: false, is_verified: false,
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(screen.getByText('Sign In', { selector: '[data-slot="card-title"]' })).toBeInTheDocument());
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com');
  });

  it('shows inline API error on registration failure', async () => {
    mockRegisterMutateAsync.mockRejectedValueOnce(new Error('Email already registered'));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await userEvent.type(screen.getByLabelText('Email'), 'taken@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(screen.getByText('Email already registered')).toBeInTheDocument()
    );
  });

  // ── Google OAuth ────────────────────────────────────────────────

  it('calls getGoogleAuthorizeUrl when Google button is clicked', async () => {
    vi.mocked(api.getGoogleAuthorizeUrl).mockResolvedValueOnce('https://accounts.google.com/...');
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));

    await waitFor(() => expect(api.getGoogleAuthorizeUrl).toHaveBeenCalled());
  });

  it('shows Redirecting text while awaiting Google URL', async () => {
    vi.mocked(api.getGoogleAuthorizeUrl).mockImplementation(() => new Promise(() => {}));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));

    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
  });

  it('shows error toast when Google authorize fails', async () => {
    vi.mocked(api.getGoogleAuthorizeUrl).mockRejectedValueOnce(new Error('Network error'));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});