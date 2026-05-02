/**
 * Portfolio ids are positive auto-increment integers; reject 0, negatives,
 * floats, and the empty string (which Number coerces to 0).
 */
export function parsePortfolioId(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
