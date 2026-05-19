import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SignedDelta } from '../components/portfolio-status/SignedDelta';

describe('SignedDelta', () => {
  it('renders ▲ and positive class for positive value', () => {
    render(<SignedDelta value={42.5} pct={1.2} currency="USD" locale="en-US" />);
    expect(screen.getByText('▲')).toBeInTheDocument();
    expect(screen.getByText(/\+\$42\.50/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\.20%/)).toBeInTheDocument();
  });

  it('renders ▼ for negative value', () => {
    render(<SignedDelta value={-3.5} currency="USD" locale="en-US" />);
    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('renders neutral • marker for exactly zero (not ▲)', () => {
    // Regression: a flat day used to render the up-arrow because the previous
    // implementation used `value >= 0`.
    render(<SignedDelta value={0} pct={0} currency="USD" locale="en-US" />);
    expect(screen.getByText('•')).toBeInTheDocument();
    expect(screen.queryByText('▲')).not.toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
  });

  it('renders an em dash when value is null', () => {
    render(<SignedDelta value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('omits the percent span when pct is null', () => {
    render(<SignedDelta value={5} pct={null} currency="USD" locale="en-US" />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
