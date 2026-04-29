/** Active dot config for chart series. Primary series use r=5, secondary use r=4. */
const makeActiveDot = (colorVar: string, primary = true) => ({
  r: primary ? 5 : 4,
  strokeWidth: 2,
  stroke: 'var(--background)',
  fill: colorVar,
});

// Pre-computed active dot configs — avoid creating new object references on every render.
export const ACTIVE_DOT_VALUE = makeActiveDot('var(--color-currentValue)');
export const ACTIVE_DOT_PRINCIPAL = makeActiveDot('var(--color-principal)', false);
export const ACTIVE_DOT_RETURN = makeActiveDot('var(--color-returnPct)');
export const ACTIVE_DOT_SP500 = makeActiveDot('var(--color-sp500ReturnPct)', false);

export const CHART_MARGIN = { left: 12, right: 12 };
