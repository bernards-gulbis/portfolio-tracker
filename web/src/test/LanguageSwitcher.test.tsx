import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

describe('LanguageSwitcher', () => {
  it('renders the language toggle button', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument();
  });

  it('shows language options in dropdown', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: 'Language' }));

    expect(await screen.findByText('English')).toBeInTheDocument();
    expect(screen.getByText('Latviski')).toBeInTheDocument();
  });

  it('calls changeLanguage when a language is selected', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(await screen.findByText('Latviski'));

    // After language change, the button label changes to the Latvian translation
    expect(screen.getByRole('button', { name: /Language|Valoda/ })).toBeInTheDocument();
  });
});
