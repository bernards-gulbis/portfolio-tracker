import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';

import type { Currency } from '../../hooks/useCurrencyPreference';
import type { DayChange } from '../../utils/eurMetrics';
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  formatSignedPp,
  formatTaxRatePercent,
  getValueClass,
} from '../../utils/formatters';

import { formatCurrencyWithPercent } from './formatCurrencyWithPercent';
import { KpiTile } from './KpiTile';
import { HeroSparkline, type SparklinePoint } from './HeroSparkline';

export interface HeroPortfolioCardProps {
  portfolioValue: number | null;
  displayCurrency: Currency;
  locale: string;
  /** Aggregated day-over-day change from per-holding prior closes; null when unavailable. */
  dayChange: DayChange | null;
  netInvested: number | null;
  totalReturn: number | null;
  /** Annualized TWR, null when the series is too short to annualize. */
  annualizedReturn: number | null;
  /** Portfolio TWR minus S&P 500 return in percentage points. */
  vsSpPts: number | null;
  afterTaxValue: number | null;
  estimatedTax: number | null;
  taxRate: number;
  /** Only set in EUR display mode. */
  fxImpact: number | null;
  fxImpactPct: number | null;
  /** Year of the first transaction, used as the scope chip on Total Return. */
  inceptionYear: number | null;
  /** Recent-history points for the inline sparkline; sliced upstream to ~30 days. */
  sparklineData: SparklinePoint[];
}

const valueOrDash = (n: number | null, fmt: (v: number) => string): string =>
  n == null ? '—' : fmt(n);

export const HeroPortfolioCard = ({
  portfolioValue,
  displayCurrency,
  locale,
  dayChange,
  netInvested,
  totalReturn,
  annualizedReturn,
  vsSpPts,
  afterTaxValue,
  estimatedTax,
  taxRate,
  fxImpact,
  fxImpactPct,
  inceptionYear,
  sparklineData,
}: HeroPortfolioCardProps) => {
  const { t } = useTranslation();

  const valueLabel = t('status.portfolioValue');
  const valueText = valueOrDash(portfolioValue, (v) =>
    formatCurrency(v, displayCurrency, locale),
  );

  const dayChangeLine = dayChange == null ? null : (
    <div className="flex items-baseline gap-2 text-base sm:text-lg">
      <span className={`font-semibold tabular-nums ${getValueClass(dayChange.usd)}`}>
        {formatCurrencyWithPercent(dayChange.usd, dayChange.pct, displayCurrency, locale)}
      </span>
      <span className="text-sm text-muted-foreground">{t('status.today')}</span>
      {dayChange.partial && (
        <span
          className="text-xs text-muted-foreground"
          title={t('status.dayChangePartialNote')}
        >
          *
        </span>
      )}
    </div>
  );

  const fxCaption =
    fxImpact == null ? undefined : (
      <p className={getValueClass(fxImpact)}>
        {formatCurrencyWithPercent(fxImpact, fxImpactPct, 'EUR', locale)}
        <span className="text-muted-foreground ml-1">{t('status.fxImpact')}</span>
      </p>
    );

  const annualizedCaption =
    annualizedReturn == null ? undefined : (
      <p className={`${getValueClass(annualizedReturn)} font-medium`}>
        {formatSignedPercent(annualizedReturn)}{' '}
        <span className="text-muted-foreground">{t('status.annualized').toLowerCase()}</span>
      </p>
    );

  const vsSpCaption =
    vsSpPts == null ? undefined : (
      <p className={`${getValueClass(vsSpPts)} font-medium`}>
        {vsSpPts >= 0 ? t('status.outperform') : t('status.underperform')}
      </p>
    );
  const vsSpValue = formatSignedPp(vsSpPts, t('status.points'));

  const taxCaption =
    estimatedTax == null ? undefined : (
      <p className="text-muted-foreground">
        −{formatCurrency(estimatedTax, displayCurrency, locale)} {t('status.taxCaption')}
      </p>
    );

  const totalReturnScope = inceptionYear == null ? null : (
    <span>{t('status.scopeSinceYear', { year: inceptionYear })}</span>
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">{valueLabel}</p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">{valueText}</p>
            {dayChangeLine}
          </div>
          {sparklineData.length >= 2 && (
            <HeroSparkline
              data={sparklineData}
              positive={
                sparklineData[sparklineData.length - 1].value >= sparklineData[0].value
              }
            />
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 border-t pt-4">
          <KpiTile
            label={t('status.netInvested')}
            value={valueOrDash(netInvested, (v) =>
              formatCurrency(v, displayCurrency, locale),
            )}
            caption={fxCaption}
            tooltip={<p>{t('status.netInvestedTooltip')}</p>}
          />
          <KpiTile
            label={t('status.totalReturn')}
            value={valueOrDash(totalReturn, (v) =>
              formatSignedCurrency(v, displayCurrency, locale),
            )}
            valueClass={totalReturn == null ? undefined : getValueClass(totalReturn)}
            caption={annualizedCaption}
            tooltip={<p>{t('status.totalReturnTooltip')}</p>}
            scopeChip={totalReturnScope}
          />
          <KpiTile
            label={t('status.vsSp500')}
            value={vsSpValue}
            valueClass={vsSpPts == null ? undefined : getValueClass(vsSpPts)}
            caption={vsSpCaption}
            tooltip={<p>{t('status.vsSp500Tooltip')}</p>}
          />
          <KpiTile
            label={t('status.afterTaxValue')}
            value={valueOrDash(afterTaxValue, (v) =>
              formatCurrency(v, displayCurrency, locale),
            )}
            caption={taxCaption}
            tooltip={
              <p>{t('status.afterTaxTooltip', { rate: formatTaxRatePercent(taxRate) })}</p>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};
