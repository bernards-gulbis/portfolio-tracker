import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercentPlain,
  formatQuantity,
  getValueClass,
} from '../utils/formatters';
import { applyRateToHolding, type EurMetrics } from '../utils/eurMetrics';
import type { PricedHolding } from '../api';
import type { Currency } from '../hooks/useCurrencyPreference';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangleIcon, ClockIcon } from 'lucide-react';

type EurVals = ReturnType<typeof applyRateToHolding>;

// Hide the cash row when the balance rounds to zero at typical display precision.
// Below this threshold a value like 0.0001 USD would render as "$0.00" and add
// noise without information; using a small epsilon avoids float-drift artifacts.
const MIN_CASH_DISPLAY_THRESHOLD = 0.005;

const renderCurrentValue = (
  holding: PricedHolding,
  eurVals: EurVals | null,
  locale: string,
): string => {
  if (eurVals == null) {
    return holding.current_value == null
      ? '—'
      : formatCurrency(holding.current_value, 'USD', locale);
  }
  return eurVals.currentValueEur == null
    ? '—'
    : formatCurrency(eurVals.currentValueEur, 'EUR', locale);
};

const renderInlineSignedPair = (
  value: number | null,
  pct: number | null,
  currency: Currency,
  locale: string,
) => {
  if (value == null) return <span>—</span>;
  const cls = getValueClass(value);
  const arrow = value >= 0 ? '▲' : '▼';
  return (
    <span className={`inline-flex items-baseline justify-end gap-1.5 font-medium tabular-nums ${cls}`}>
      <span aria-hidden>{arrow}</span>
      <span>{formatSignedCurrency(value, currency, locale)}</span>
      {pct != null && (
        <span className="text-xs">{formatSignedPercentPlain(pct)}</span>
      )}
    </span>
  );
};

interface HoldingsTableProps {
  holdings: PricedHolding[];
  missingPrices: string[];
  cash: number;
  displayCurrency: Currency;
  showEur: boolean;
  eurMetrics: EurMetrics | null;
  locale: string;
}

export const HoldingsTable = memo(
  ({
    holdings,
    missingPrices,
    cash,
    displayCurrency,
    showEur,
    eurMetrics,
    locale,
  }: HoldingsTableProps) => {
    const { t } = useTranslation();
    const eurAvailable = eurMetrics !== null;
    const effectiveCurrency: Currency = showEur && eurAvailable ? 'EUR' : displayCurrency;
    const cashDisplay = showEur && eurAvailable ? eurMetrics.cashEur : cash;

    const holdingsWithEur = useMemo(() => {
      const rate = showEur && eurAvailable ? eurMetrics.rate : null;
      return holdings.map((h) => ({
        holding: h,
        eurVals: rate == null ? null : applyRateToHolding(h, rate),
      }));
    }, [holdings, showEur, eurAvailable, eurMetrics]);

    const { totalUnrealizedGL, totalMarketValue, totalCost } = useMemo(() => {
      let glSum = 0;
      let glHasValue = false;
      let marketSum = cashDisplay;
      let costSum = 0;
      for (const { holding, eurVals } of holdingsWithEur) {
        const useEur = showEur && eurVals?.unrealizedGainLossEur != null;
        if (useEur) {
          glSum += eurVals.unrealizedGainLossEur as number;
          glHasValue = true;
          costSum += eurVals.totalCostEur;
        } else if (holding.unrealized_gain_loss != null) {
          glSum += holding.unrealized_gain_loss;
          glHasValue = true;
          costSum += holding.total_cost;
        }
        if (showEur && eurVals?.currentValueEur != null) {
          marketSum += eurVals.currentValueEur;
        } else if (holding.current_value != null) {
          marketSum += holding.current_value;
        }
      }
      return {
        totalUnrealizedGL: glHasValue ? glSum : null,
        totalMarketValue: marketSum,
        totalCost: costSum,
      };
    }, [holdingsWithEur, showEur, cashDisplay]);

    const totalUnrealizedPct =
      totalUnrealizedGL == null || totalCost <= 0 ? null : (totalUnrealizedGL / totalCost) * 100;

    const stalePrices = useMemo(
      () => holdings.filter((h) => h.price_source === 'last_known').map((h) => h.ticker),
      [holdings],
    );

    const formatAsOf = (iso: string | null): string => {
      if (iso == null || iso === '') return t('status.priceAsOfUnknown');
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale);
    };

    // Applying the FX rate to both current and previous prices cancels in the %
    // and scales the absolute proportionally — same result as converting at the end.
    const rowDayChange = (
      h: PricedHolding,
      eurVals: EurVals | null,
    ): { value: number | null; pct: number | null } => {
      if (h.current_price == null || h.previous_close == null) {
        return { value: null, pct: null };
      }
      const useEur = showEur && eurAvailable && eurVals?.currentValueEur != null;
      const rate = useEur && eurMetrics ? eurMetrics.rate : 1;
      const valueDeltaUsd = (h.current_price - h.previous_close) * h.quantity;
      const valueDelta = valueDeltaUsd * rate;
      const pct = h.previous_close > 0
        ? ((h.current_price - h.previous_close) / h.previous_close) * 100
        : null;
      return { value: valueDelta, pct };
    };

    const rowWeight = (rowValue: number | null): number | null => {
      if (rowValue == null || totalMarketValue <= 0) return null;
      return (rowValue / totalMarketValue) * 100;
    };
    const cashWeight = rowWeight(cashDisplay);

    return (
      <div>
        {missingPrices.length > 0 && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertDescription>
              {t('status.missingPrices', { tickers: missingPrices.join(', ') })}
            </AlertDescription>
          </Alert>
        )}
        {stalePrices.length > 0 && (
          <Alert className="mb-4">
            <ClockIcon className="h-4 w-4" />
            <AlertDescription>
              {t('status.stalePrices', { tickers: stalePrices.join(', ') })}
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <Table>
            <TableCaption className="sr-only">{t('status.positions')}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('status.columns.ticker')}</TableHead>
                <TableHead className="text-right">{t('status.columns.quantity')}</TableHead>
                <TableHead className="text-right">{t('status.columns.avgCostUsd')}</TableHead>
                <TableHead className="text-right">{t('status.columns.lastUsd')}</TableHead>
                <TableHead className="text-right">
                  {t('status.columns.marketValue')}
                </TableHead>
                <TableHead className="text-right">{t('status.todayColumn')}</TableHead>
                <TableHead className="text-right">{t('status.columns.unrealizedGL')}</TableHead>
                <TableHead className="text-right">{t('status.percentOfPortfolio')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashDisplay > MIN_CASH_DISPLAY_THRESHOLD && (
                <TableRow key="CASH" className="text-muted-foreground hover:bg-muted/30 transition-colors">
                  <TableCell colSpan={4} className="italic">{t('status.cashRow')}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(cashDisplay, effectiveCurrency, locale)}
                  </TableCell>
                  <TableCell colSpan={2} />
                  <TableCell className="text-right tabular-nums">
                    {cashWeight == null ? '—' : `${cashWeight.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              )}
              {holdingsWithEur.map(({ holding, eurVals }) => {
                const dayCh = rowDayChange(holding, eurVals);
                const useEurGL = showEur && eurVals?.unrealizedGainLossEur != null;
                const rowValueInDisplay =
                  showEur && eurVals?.currentValueEur != null
                    ? eurVals.currentValueEur
                    : holding.current_value;
                const weight = rowWeight(rowValueInDisplay);
                return (
                  <TableRow key={holding.ticker} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-semibold">
                      <span className="inline-flex items-center gap-1">
                        {holding.ticker}
                        {holding.price_source === 'last_known' && (
                          <ClockIcon
                            className="h-3 w-3 text-muted-foreground"
                            aria-label={t('status.priceStaleBadge', {
                              asOf: formatAsOf(holding.price_as_of),
                            })}
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(holding.quantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(holding.average_cost, 'USD', locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {holding.current_price == null
                        ? '—'
                        : formatCurrency(holding.current_price, 'USD', locale)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {renderCurrentValue(holding, eurVals, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {renderInlineSignedPair(dayCh.value, dayCh.pct, effectiveCurrency, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {renderInlineSignedPair(
                        useEurGL
                          ? eurVals.unrealizedGainLossEur
                          : holding.unrealized_gain_loss,
                        holding.unrealized_gain_loss_pct,
                        useEurGL ? 'EUR' : 'USD',
                        locale,
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {weight == null ? '—' : `${weight.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell>{t('status.total')}</TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(totalMarketValue, effectiveCurrency, locale)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {renderInlineSignedPair(
                    totalUnrealizedGL,
                    totalUnrealizedPct,
                    effectiveCurrency,
                    locale,
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">100.0%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      </div>
    );
  },
);
