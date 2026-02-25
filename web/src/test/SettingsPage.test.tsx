import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsLayout, ProfileSection, PasswordSection, TaxSection, AccountSection } from '../components/SettingsPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useUpdateProfile: vi.fn(),
  useChangePassword: vi.fn(),
  useUpdateTaxRate: vi.fn(),
  useCloseAccount: vi.fn(),
}));

import { useAuth } from '../context/AuthContext';
import { useUpdateProfile, useChangePassword, useUpdateTaxRate, useCloseAccount } from '../hooks/useAuth';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderWithProviders = (ui: React.ReactElement, initialEntry = '/settings') => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const defaultUser = {
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
  oauth_providers: [] as string[],
  picture: null,
  tax_rate: 0.255,
};

// ================== SettingsLayout ==================

describe('SettingsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: defaultUser } as ReturnType<typeof useAuth>);
  });

  const renderLayout = (initialEntry = '/settings/profile') => {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="settings" element={<SettingsLayout />}>
              <Route path="profile" element={<div>Profile Content</div>} />
              <Route path="password" element={<div>Password Content</div>} />
              <Route path="tax" element={<div>Tax Content</div>} />
              <Route path="account" element={<div>Account Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders Settings heading and description', () => {
    renderLayout();

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Manage your account settings and preferences.')).toBeInTheDocument();
  });

  it('renders four navigation links', () => {
    renderLayout();

    const profileLink = screen.getByText('Profile').closest('a');
    expect(profileLink).toHaveAttribute('href', '/settings/profile');

    const passwordLink = screen.getByText('Password').closest('a');
    expect(passwordLink).toHaveAttribute('href', '/settings/password');

    const taxLink = screen.getByText('Tax').closest('a');
    expect(taxLink).toHaveAttribute('href', '/settings/tax');

    const accountLink = screen.getByText('Account').closest('a');
    expect(accountLink).toHaveAttribute('href', '/settings/account');
  });

  it('renders child route content via Outlet', () => {
    renderLayout('/settings/profile');

    expect(screen.getByText('Profile Content')).toBeInTheDocument();
  });

  it('renders password route content', () => {
    renderLayout('/settings/password');

    expect(screen.getByText('Password Content')).toBeInTheDocument();
  });
});

// ================== ProfileSection ==================

describe('ProfileSection', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: defaultUser } as ReturnType<typeof useAuth>);
    vi.mocked(useUpdateProfile).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateProfile>);
  });

  it('renders name input pre-filled with user name', () => {
    renderWithProviders(<ProfileSection />);

    expect(screen.getByLabelText('Name')).toHaveValue('Test User');
  });

  it('renders email input as disabled', () => {
    renderWithProviders(<ProfileSection />);

    const emailInput = screen.getByLabelText('Email');
    expect(emailInput).toBeDisabled();
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('calls updateProfile.mutateAsync with trimmed name on submit', async () => {
    mockMutateAsync.mockResolvedValueOnce(undefined);
    renderWithProviders(<ProfileSection />);

    const input = screen.getByLabelText('Name');
    await userEvent.clear(input);
    await userEvent.type(input, '  New Name  ');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ name: 'New Name' });
    });
  });

  it('shows validation error when name is empty', async () => {
    renderWithProviders(<ProfileSection />);

    const input = screen.getByLabelText('Name');
    await userEvent.clear(input);

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows validation error when name is only whitespace', async () => {
    renderWithProviders(<ProfileSection />);

    const input = screen.getByLabelText('Name');
    await userEvent.clear(input);
    await userEvent.type(input, '   ');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows API error on mutation failure', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Server error'));
    renderWithProviders(<ProfileSection />);

    const input = screen.getByLabelText('Name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Valid Name');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('disables submit button while pending', () => {
    vi.mocked(useUpdateProfile).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    } as unknown as ReturnType<typeof useUpdateProfile>);

    renderWithProviders(<ProfileSection />);

    expect(screen.getByRole('button', { name: /Save changes/ })).toBeDisabled();
  });
});

// ================== PasswordSection ==================

describe('PasswordSection', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: defaultUser } as ReturnType<typeof useAuth>);
    vi.mocked(useChangePassword).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useChangePassword>);
  });

  it('renders new password and confirm password fields', () => {
    renderWithProviders(<PasswordSection />);

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
  });

  it('shows "Change password" button for non-OAuth users', () => {
    renderWithProviders(<PasswordSection />);

    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  it('shows OAuth info alert and "Set password" button for OAuth users', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...defaultUser, oauth_providers: ['google'] },
    } as ReturnType<typeof useAuth>);

    renderWithProviders(<PasswordSection />);

    expect(screen.getByText(/You signed in with Google/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument();
  });

  it('does not show OAuth alert for password-only users', () => {
    renderWithProviders(<PasswordSection />);

    expect(screen.queryByText(/You signed in with Google/)).not.toBeInTheDocument();
  });

  it('shows validation error for password shorter than 8 chars', async () => {
    renderWithProviders(<PasswordSection />);

    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'short');

    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows validation error when passwords do not match', async () => {
    renderWithProviders(<PasswordSection />);

    await userEvent.type(screen.getByLabelText('New password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different123');

    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('calls changePassword.mutateAsync with matching password', async () => {
    mockMutateAsync.mockResolvedValueOnce(undefined);
    renderWithProviders(<PasswordSection />);

    await userEvent.type(screen.getByLabelText('New password'), 'newpassword123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'newpassword123');

    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ password: 'newpassword123' });
    });
  });

  it('shows API error on mutation failure', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Weak password'));
    renderWithProviders(<PasswordSection />);

    await userEvent.type(screen.getByLabelText('New password'), 'newpassword123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'newpassword123');

    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(screen.getByText('Weak password')).toBeInTheDocument();
    });
  });

  it('disables submit button while pending', () => {
    vi.mocked(useChangePassword).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    } as unknown as ReturnType<typeof useChangePassword>);

    renderWithProviders(<PasswordSection />);

    expect(screen.getByRole('button', { name: /Change password/ })).toBeDisabled();
  });
});

// ================== TaxSection ==================

describe('TaxSection', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: defaultUser } as ReturnType<typeof useAuth>);
    vi.mocked(useUpdateTaxRate).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateTaxRate>);
  });

  it('renders tax rate input pre-filled with user value', () => {
    renderWithProviders(<TaxSection />);

    expect(screen.getByLabelText('Tax rate (%)')).toHaveValue(25.5);
  });

  it('renders description text', () => {
    renderWithProviders(<TaxSection />);

    expect(screen.getByText('Configure the tax rate applied to capital gains calculations.')).toBeInTheDocument();
  });

  it('calls updateTaxRate.mutateAsync with decimal value on submit', async () => {
    mockMutateAsync.mockResolvedValueOnce(undefined);
    renderWithProviders(<TaxSection />);

    const input = screen.getByLabelText('Tax rate (%)');
    await userEvent.clear(input);
    await userEvent.type(input, '15');

    await userEvent.click(screen.getByRole('button', { name: 'Save tax rate' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ tax_rate: 0.15 });
    });
  });

  it('shows validation error for value over 100', async () => {
    renderWithProviders(<TaxSection />);

    const input = screen.getByLabelText('Tax rate (%)');
    await userEvent.clear(input);
    await userEvent.type(input, '150');

    await userEvent.click(screen.getByRole('button', { name: 'Save tax rate' }));

    await waitFor(() => {
      expect(screen.getByText('Tax rate cannot exceed 100%')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows API error on mutation failure', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Server error'));
    renderWithProviders(<TaxSection />);

    const input = screen.getByLabelText('Tax rate (%)');
    await userEvent.clear(input);
    await userEvent.type(input, '20');

    await userEvent.click(screen.getByRole('button', { name: 'Save tax rate' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('disables submit button while pending', () => {
    vi.mocked(useUpdateTaxRate).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    } as unknown as ReturnType<typeof useUpdateTaxRate>);

    renderWithProviders(<TaxSection />);

    expect(screen.getByRole('button', { name: /Save tax rate/ })).toBeDisabled();
  });
});

// ================== AccountSection ==================

describe('AccountSection', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: defaultUser } as ReturnType<typeof useAuth>);
    vi.mocked(useCloseAccount).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCloseAccount>);
  });

  it('renders danger zone heading and description', () => {
    renderWithProviders(<AccountSection />);

    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    expect(screen.getByText(/Permanently delete your account/)).toBeInTheDocument();
  });

  it('shows password form for non-OAuth users', () => {
    renderWithProviders(<AccountSection />);

    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Type DELETE to confirm')).not.toBeInTheDocument();
  });

  it('shows confirmation form for OAuth users', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...defaultUser, oauth_providers: ['google'] },
    } as ReturnType<typeof useAuth>);

    renderWithProviders(<AccountSection />);

    expect(screen.getByLabelText('Type DELETE to confirm')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('shows validation error for empty password (non-OAuth)', async () => {
    renderWithProviders(<AccountSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Close Account' }));

    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('calls closeAccount with password (non-OAuth)', async () => {
    mockMutateAsync.mockResolvedValueOnce(undefined);
    renderWithProviders(<AccountSection />);

    await userEvent.type(screen.getByLabelText('Current password'), 'mypassword');

    await userEvent.click(screen.getByRole('button', { name: 'Close Account' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ password: 'mypassword' });
    });
  });

  it('shows validation error when confirmation is not DELETE (OAuth)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...defaultUser, oauth_providers: ['google'] },
    } as ReturnType<typeof useAuth>);

    renderWithProviders(<AccountSection />);

    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'wrong');

    await userEvent.click(screen.getByRole('button', { name: 'Close Account' }));

    await waitFor(() => {
      // The label "Type DELETE to confirm" is always present; the validation error adds a second instance
      expect(screen.getAllByText('Type DELETE to confirm').length).toBeGreaterThan(1);
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('calls closeAccount with confirmation DELETE (OAuth)', async () => {
    mockMutateAsync.mockResolvedValueOnce(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: { ...defaultUser, oauth_providers: ['google'] },
    } as ReturnType<typeof useAuth>);

    renderWithProviders(<AccountSection />);

    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');

    await userEvent.click(screen.getByRole('button', { name: 'Close Account' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ confirmation: 'DELETE' });
    });
  });

  it('shows API error on mutation failure (non-OAuth)', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Wrong password'));
    renderWithProviders(<AccountSection />);

    await userEvent.type(screen.getByLabelText('Current password'), 'wrongpassword');

    await userEvent.click(screen.getByRole('button', { name: 'Close Account' }));

    await waitFor(() => {
      expect(screen.getByText('Wrong password')).toBeInTheDocument();
    });
  });

  it('disables submit button while pending', () => {
    vi.mocked(useCloseAccount).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    } as unknown as ReturnType<typeof useCloseAccount>);

    renderWithProviders(<AccountSection />);

    expect(screen.getByRole('button', { name: /Close Account/ })).toBeDisabled();
  });
});
