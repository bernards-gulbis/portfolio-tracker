import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppFooter } from '../components/AppFooter';
import { APP_VERSION } from '../constants/app';

describe('AppFooter', () => {
  it('renders Yahoo Finance attribution link', () => {
    render(<AppFooter />);
    const link = screen.getByRole('link', { name: /yahoo finance/i });
    expect(link).toHaveAttribute('href', 'https://finance.yahoo.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.textContent).toMatch(/yahoo finance/i);
  });

  it('renders the current year in copyright text', () => {
    render(<AppFooter />);
    const year = String(new Date().getFullYear());
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
  });

  it('renders author link in copyright', () => {
    render(<AppFooter />);
    const link = screen.getByRole('link', { name: /bernards gulbis/i });
    expect(link).toHaveAttribute('href', 'https://bg.id.lv/');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.textContent).toMatch(/bernards gulbis/i);
  });

  it('renders the app version', () => {
    render(<AppFooter />);
    const escaped = APP_VERSION.replace(/\./g, '\\.');
    expect(screen.getByText(new RegExp(escaped))).toBeInTheDocument();
  });

  it('applies a className passed via props', () => {
    const { container } = render(<AppFooter className="custom-class" />);
    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.className).toContain('custom-class');
  });

  it('renders a disclaimer paragraph', () => {
    const { container } = render(<AppFooter />);
    const disclaimer = container.querySelector('footer p');
    expect(disclaimer).not.toBeNull();
    expect(disclaimer?.textContent ?? '').not.toBe('');
  });
});
