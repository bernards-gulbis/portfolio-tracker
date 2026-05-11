import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { CollapsibleSection } from '../components/portfolio-status/CollapsibleSection';

describe('CollapsibleSection', () => {
  it('renders the summary slot inline with the title', () => {
    render(
      <CollapsibleSection
        title="Realized Gains"
        summary="+€264,468 (35 sales)"
      >
        <div>body</div>
      </CollapsibleSection>,
    );

    // Summary text is visible in collapsed state — the reason for adding the slot.
    expect(screen.getByText('+€264,468 (35 sales)')).toBeInTheDocument();
    expect(screen.getByText('Realized Gains')).toBeInTheDocument();
  });

  it('keeps the summary visible after expanding', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Dividends" summary="€1,234 (12 payments)">
        <div>body</div>
      </CollapsibleSection>,
    );

    await user.click(screen.getByRole('button', { name: /Dividends/ }));

    // Summary stays — the slot is part of the trigger row, not inside the content.
    expect(screen.getByText('€1,234 (12 payments)')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('omits the summary span entirely when the prop is not provided', () => {
    render(
      <CollapsibleSection title="Withdrawals">
        <div>body</div>
      </CollapsibleSection>,
    );

    // Title is present, no summary text node — ensures nothing renders in the
    // right-aligned slot so the trigger row doesn't get an empty layout box.
    expect(screen.getByText('Withdrawals')).toBeInTheDocument();
    expect(screen.queryByText(/payments/)).toBeNull();
  });
});
