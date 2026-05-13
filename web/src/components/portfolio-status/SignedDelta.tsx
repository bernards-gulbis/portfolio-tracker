import type { Currency } from '../../hooks/useCurrencyPreference';
import {
  formatSignedCurrency,
  formatSignedPercentPlain,
  getValueClass,
} from '../../utils/formatters';

/** Three-way directional indicator: '▲' positive, '▼' negative, '•' flat. */
const arrowFor = (value: number): string => {
  if (value > 0) return '▲';
  if (value < 0) return '▼';
  return '•';
};

export interface SignedDeltaProps {
  /** Money delta. ``null``/``undefined`` renders as a dash. */
  value: number | null | undefined;
  /** Optional companion percentage. Hidden when ``null``/``undefined``. */
  pct?: number | null | undefined;
  currency?: Currency;
  locale?: string;
  /** When true, color the whole element via ``getValueClass`` (positive/negative/neutral). */
  colored?: boolean;
  className?: string;
}

/**
 * Shared inline ▲/value/% pair used across the summary page (Hero day-change,
 * holdings table cells, totals row, FX-impact caption). Treats zero as a
 * distinct neutral state so a flat day doesn't read as a positive move.
 */
export const SignedDelta = ({
  value,
  pct,
  currency = 'USD',
  locale = 'en-US',
  colored = true,
  className = '',
}: SignedDeltaProps) => {
  if (value == null) return <span className={className}>—</span>;

  const colorClass = colored ? getValueClass(value) : '';
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 tabular-nums ${colorClass} ${className}`.trim()}
    >
      <span aria-hidden>{arrowFor(value)}</span>
      <span>{formatSignedCurrency(value, currency, locale)}</span>
      {pct != null && <span className="text-xs">{formatSignedPercentPlain(pct)}</span>}
    </span>
  );
};
