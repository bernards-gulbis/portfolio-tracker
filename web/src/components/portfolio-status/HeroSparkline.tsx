import { useMemo } from 'react';

export interface SparklinePoint {
  date: string;
  value: number;
}

interface HeroSparklineProps {
  data: SparklinePoint[];
  positive: boolean;
  width?: number;
  height?: number;
  ariaLabel?: string;
}

const PADDING_Y = 2;

export const HeroSparkline = ({
  data,
  positive,
  width = 140,
  height = 44,
  ariaLabel,
}: HeroSparklineProps) => {
  const { linePath, fillPath } = useMemo(() => {
    const values = data.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const scaleX = data.length <= 1 ? 0 : width / (data.length - 1);
    const usableHeight = height - PADDING_Y * 2;

    const toY = (v: number): number => {
      if (range === 0) return height / 2;
      return PADDING_Y + (1 - (v - min) / range) * usableHeight;
    };

    const coords = data.map((point, idx) => ({
      x: idx * scaleX,
      y: toY(point.value),
    }));

    const line = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(' ');
    const fill = `${line} L${coords[coords.length - 1].x.toFixed(2)},${height} L0,${height} Z`;
    return { linePath: line, fillPath: fill };
  }, [data, width, height]);

  const strokeColor = positive ? 'var(--positive)' : 'var(--negative)';
  const fillColor = positive
    ? 'color-mix(in oklab, var(--positive) 18%, transparent)'
    : 'color-mix(in oklab, var(--negative) 18%, transparent)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? 'Portfolio trend'}
      className="shrink-0"
    >
      <path d={fillPath} fill={fillColor} />
      <path d={linePath} stroke={strokeColor} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
