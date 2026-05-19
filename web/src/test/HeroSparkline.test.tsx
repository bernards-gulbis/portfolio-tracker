import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HeroSparkline } from '../components/portfolio-status/HeroSparkline';

const points = [
  { date: '2026-04-13', value: 100 },
  { date: '2026-04-20', value: 110 },
  { date: '2026-04-27', value: 95 },
  { date: '2026-05-04', value: 120 },
];

describe('HeroSparkline', () => {
  it('renders the SVG line path', () => {
    render(<HeroSparkline data={points} positive />);
    const svg = screen.getByRole('img');
    expect(svg).toBeInTheDocument();
    expect(svg.querySelectorAll('path').length).toBe(2);
  });

  it('omits the scope caption by default', () => {
    render(<HeroSparkline data={points} positive />);
    expect(screen.queryByText('30d')).toBeNull();
  });

  it('renders the muted scope caption when scopeLabel is provided', () => {
    render(<HeroSparkline data={points} positive scopeLabel="30d" />);
    expect(screen.getByText('30d')).toBeInTheDocument();
  });
});
