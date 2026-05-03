import { useQuery } from '@tanstack/react-query';

import { FxRate, getFxRate } from '../api';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fetch the USD→EUR rate for a specific date.
 *
 * Today/future dates resolve to the live rate; past dates to the historical
 * rate (with up to 7 days of back-padding for weekends and exchange holidays
 * — handled server-side). Cache is permanent because historical rates don't
 * change retroactively. ``retry: false`` so a 404 ("rate unavailable") doesn't
 * burn quota — the caller should fall back to a live or cached rate.
 */
export const useFxRate = (date: string | undefined) =>
  useQuery<FxRate | null>({
    queryKey: ['fxRate', date],
    queryFn: () => (date ? getFxRate(date) : Promise.resolve(null)),
    enabled: !!date && DATE_RE.test(date),
    staleTime: Infinity,
    retry: false,
  });
