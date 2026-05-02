const makeActiveDot = (colorVar: string, primary = true) => ({
  r: primary ? 5 : 4,
  strokeWidth: 2,
  stroke: 'var(--background)',
  fill: colorVar,
});

// Pre-computed to avoid new object references on every render.
export const ACTIVE_DOT_VALUE = makeActiveDot('var(--color-currentValue)');
export const ACTIVE_DOT_PRINCIPAL = makeActiveDot('var(--color-principal)', false);
export const ACTIVE_DOT_RETURN = makeActiveDot('var(--color-returnPct)');
export const ACTIVE_DOT_SP500 = makeActiveDot('var(--color-sp500ReturnPct)', false);

export const CHART_MARGIN = { left: 12, right: 12 };
