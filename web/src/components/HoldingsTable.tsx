import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatSignedCurrency, formatSignedPercent, formatQuantity, formatDaysHeld, getValueClass, daysSinceLocalDate } from '../utils/formatters';
import { useDaysHeldLabels } from '../hooks/useDaysHeldLabels';
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

function computeDaysHeld(holdings: PricedHolding[]): Record<string, number> {
  const now = Date.now();
  const map: Record<string, number> = {};
  for (const h of holdings) {
    map[h.ticker] = daysSinceLocalDate(h.first_buy_date, now);
  }
  return map;
}

type EurVals = ReturnType<typeof applyRateToHolding>;

function renderCurrentValue(holding: PricedHolding, eurVals: EurVals | null, locale: string): string {
  if (eurVals == null) {
    return holding.current_value == null ? '-' : formatCurrency(holding.current_value, 'USD', locale);
  }
  return eurVals.currentValueEur == null ? '-' : formatCurrency(eurVals.currentValueEur, 'EUR', locale);
}

function renderUnrealizedGL(holding: PricedHolding, eurVals: EurVals | null, locale: string) {
  const pct = holding.unrealized_gain_loss_pct;
  if (pct == null) return '-';

  const eurValue = eurVals?.unrealizedGainLossEur;
  const value = eurValue ?? holding.unrealized_gain_loss;
  if (value == null) return '-';

  const currency = eurValue == null ? 'USD' : 'EUR';
  const valueClass = getValueClass(value);
  return (
    <div className="flex flex-col items-end">
      <span className={`font-semibold ${valueClass}`}>{formatSignedCurrency(value, currency, locale)}</span>
      <span className={`text-sm ${valueClass}`}>{formatSignedPercent(pct)}</span>
    </div>
  );
}

interface HoldingsTableProps {
  holdings: PricedHolding[];
  missingPrices: string[];
  cash: number;
  displayCurrency: Currency;
  showEur: boolean;
  eurMetrics: EurMetrics | null;
  locale: string;
}

export const HoldingsTable = memo(({
  holdings,
  missingPrices,
  cash,
  displayCurrency,
  showEur,
  eurMetrics,
  locale,
}: HoldingsTableProps) => {
  const { t } = useTranslation();
  const daysLabels = useDaysHeldLabels();
  const eurAvailable = eurMetrics !== null;
  const effectiveCurrency = showEur && eurAvailable ? 'EUR' as Currency : displayCurrency;
  const cashDisplay = showEur && eurAvailable ? eurMetrics.cashEur : cash;

  const daysHeldMap = useMemo(() => computeDaysHeld(holdings), [holdings]);

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

  const totalUnrealizedPct = totalUnrealizedGL == null || totalCost <= 0
    ? null
    : (totalUnrealizedGL / totalCost) * 100;

  const stalePrices = useMemo(
    () => holdings.filter((h) => h.price_source === 'last_known').map((h) => h.ticker),
    [holdings],
  );

  const formatAsOf = (iso: string | null): string => {
    if (iso == null || iso === '') return t('status.priceAsOfUnknown');
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale);
  };

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
              <TableHead className="text-right">{t('status.columns.daysHeld')}</TableHead>
              <TableHead className="text-right">{t('status.columns.quantity')}</TableHead>
              <TableHead className="text-right">
                <div className="flex flex-col items-end">
                  <span className="flex items-center gap-1">{t('status.columns.cost')}{showEur && <span className="text-muted-foreground font-normal">USD</span>}</span>
                  <span className="text-sm font-normal text-muted-foreground">{t('status.priceCaption')}</span>
                </div>
              </TableHead>
              <TableHead className="text-right">
                <div className="flex flex-col items-end">
                  <span className="flex items-center gap-1">{t('status.columns.marketValue')}{showEur && eurAvailable && <span className="text-muted-foreground font-normal">EUR</span>}</span>
                  <span className="text-sm font-normal text-muted-foreground">{t('status.currentPriceCaption')}</span>
                </div>
              </TableHead>
              <TableHead className="text-right">
                <span className="flex items-center gap-1">{t('status.columns.unrealizedGL')}{showEur && eurAvailable && <span className="text-muted-foreground font-normal">EUR</span>}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow key="CASH">
              <TableCell className="font-semibold">CASH</TableCell>
              <TableCell className="text-right tabular-nums">-</TableCell>
              <TableCell className="text-right tabular-nums">-</TableCell>
              <TableCell className="text-right tabular-nums">-</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrency(cashDisplay, effectiveCurrency, locale)}
              </TableCell>
              <TableCell className="text-right tabular-nums">-</TableCell>
            </TableRow>
            {holdingsWithEur.map(({ holding, eurVals }) => (
                <TableRow key={holding.ticker}>
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
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {daysHeldMap[holding.ticker] == null ? '-' : formatDaysHeld(daysHeldMap[holding.ticker], daysLabels)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(holding.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{formatCurrency(holding.total_cost, 'USD', locale)}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(holding.average_cost, 'USD', locale)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{renderCurrentValue(holding, eurVals, locale)}</span>
                      <span className="text-sm text-muted-foreground">
                        {holding.current_price == null ? '-' : formatCurrency(holding.current_price, 'USD', locale)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {renderUnrealizedGL(holding, eurVals, locale)}
                  </TableCell>
                </TableRow>
            ))}
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
              <TableCell className={`text-right tabular-nums ${totalUnrealizedGL == null ? '' : getValueClass(totalUnrealizedGL)}`}>
                {totalUnrealizedGL == null ? '-' : (
                  <div className="flex flex-col items-end">
                    <span>{formatSignedCurrency(totalUnrealizedGL, effectiveCurrency, locale)}</span>
                    {totalUnrealizedPct != null && (
                      <span className={`text-sm ${getValueClass(totalUnrealizedGL)}`}>
                        {formatSignedPercent(totalUnrealizedPct)}
                      </span>
                    )}
                  </div>
                )}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </div>
  );
});
