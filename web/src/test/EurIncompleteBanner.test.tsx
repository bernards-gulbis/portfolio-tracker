import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EurIncompleteBanner } from '../components/portfolio-status/EurIncompleteBanner';

describe('EurIncompleteBanner', () => {
  it('renders an info banner for a single missing transaction', () => {
    render(
      <EurIncompleteBanner missingCount={1} onGoToTransactions={() => {}} />,
    );
    // The banner should be visible on the page
    const alert = document.querySelector('[role="alert"]');
    expect(alert).toBeInTheDocument();
  });

  it('renders an info banner for multiple missing transactions', () => {
    render(
      <EurIncompleteBanner missingCount={3} onGoToTransactions={() => {}} />,
    );
    const alert = document.querySelector('[role="alert"]');
    expect(alert).toBeInTheDocument();
  });

  it('calls onGoToTransactions when the CTA link is clicked', () => {
    const onGoToTransactions = vi.fn();
    render(
      <EurIncompleteBanner missingCount={2} onGoToTransactions={onGoToTransactions} />,
    );

    // The CTA is rendered as a Button with variant="link" inside the Trans component
    const cta = screen.getByRole('button');
    fireEvent.click(cta);

    expect(onGoToTransactions).toHaveBeenCalledTimes(1);
  });
});
