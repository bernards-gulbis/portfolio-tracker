import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CrosshairCursor } from '../components/performance-chart/CrosshairCursor';

describe('CrosshairCursor', () => {
  it('renders nothing when points is undefined', () => {
    const { container } = render(
      <svg>
        <CrosshairCursor />
      </svg>,
    );
    expect(container.querySelector('line')).not.toBeInTheDocument();
  });

  it('renders nothing when points is an empty array', () => {
    const { container } = render(
      <svg>
        <CrosshairCursor points={[]} />
      </svg>,
    );
    expect(container.querySelector('line')).not.toBeInTheDocument();
  });

  it('renders a vertical line at the x coordinate of the first point', () => {
    const { container } = render(
      <svg>
        <CrosshairCursor points={[{ x: 42, y: 0 }]} height={300} />
      </svg>,
    );
    const line = container.querySelector('line');
    expect(line).toBeInTheDocument();
    expect(line?.getAttribute('x1')).toBe('42');
    expect(line?.getAttribute('x2')).toBe('42');
    expect(line?.getAttribute('y1')).toBe('0');
    expect(line?.getAttribute('y2')).toBe('300');
  });

  it('uses 0 as y2 when height is not provided', () => {
    const { container } = render(
      <svg>
        <CrosshairCursor points={[{ x: 10, y: 5 }]} />
      </svg>,
    );
    const line = container.querySelector('line');
    expect(line?.getAttribute('y2')).toBe('0');
  });

  it('renders a dashed stroke', () => {
    const { container } = render(
      <svg>
        <CrosshairCursor points={[{ x: 0, y: 0 }]} height={200} />
      </svg>,
    );
    const line = container.querySelector('line');
    expect(line?.getAttribute('stroke-dasharray')).toBe('3 3');
  });
});
