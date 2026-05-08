import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InfoBanner } from '../components/portfolio-status/InfoBanner';

describe('InfoBanner', () => {
  it('renders children text', () => {
    render(<InfoBanner>Some informational message</InfoBanner>);
    expect(screen.getByText('Some informational message')).toBeInTheDocument();
  });

  it('does not render a dismiss button when onDismiss is not provided', () => {
    render(<InfoBanner>No dismiss button here</InfoBanner>);
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('renders a dismiss button when onDismiss is provided', () => {
    render(<InfoBanner onDismiss={() => {}}>Dismissible banner</InfoBanner>);
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<InfoBanner onDismiss={onDismiss}>Click to dismiss</InfoBanner>);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
