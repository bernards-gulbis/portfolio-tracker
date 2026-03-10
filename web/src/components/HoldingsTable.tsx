import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatSignedCurrency, formatSignedPercent, formatQuantity, formatDaysHeld, getValueClass } from '../utils/formatters';
import { useDaysHeldLabels } from '../hooks/useDaysHeldLabels';
import { applyRateToHolding, type EurMetrics } from '../utils/eurMetrics';
import type { PricedHolding } from '../api';
import type { Currency } from '../hooks/useCurrencyPreference';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangleIcon } from 'lucide-react';

function computeDaysHeld(holdings: PricedHolding[]): Record<string, number> {
  const now = Date.now();
  const map: Record<string, number> = {};
  for (const h of holdings) {
    // Append 'T00:00:00Z' to date-only strings to ensure UTC parsing
    const dateStr = h.first_buy_date.length === 10 ? `${h.first_buy_date}T00:00:00Z` : h.first_buy_date;
    map[h.ticker] = Math.floor((now - new Date(dateStr).getTime()) / 86_400_000);
  }
  return map;
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
  const cashDisplay = showEur && eurAvailable ? eurMetrics.cashEur : cash;

  const daysHeldMap = useMemo(() => computeDaysHeld(holdings), [holdings]);

  const holdingsWithEur = useMemo(() => {
    if (!showEur || !eurAvailable) {
      return holdings.map((h) => ({ holding: h, eurVals: null }));
    }
    return holdings.map((h) => ({
      holding: h,
      eurVals: applyRateToHolding(h, eurMetrics.rate),
    }));
  }, [holdings, showEur, eurAvailable, eurMetrics]);

  // Total unrealized G/L across all holdings
  const totalUnrealizedGL = useMemo(() => {
    let sum = 0;
    let hasValue = false;
    for (const { holding, eurVals } of holdingsWithEur) {
      if (showEur && eurVals?.unrealizedGainLossEur != null) {
        sum += eurVals.unrealizedGainLossEur;
        hasValue = true;
      } else if (holding.unrealized_gain_loss != null) {
        sum += holding.unrealized_gain_loss;
        hasValue = true;
      }
    }
    return hasValue ? sum : null;
  }, [holdingsWithEur, showEur]);

  const totalCost = useMemo(() => {
    return holdingsWithEur.reduce((sum, { holding, eurVals }) => {
      if (showEur && eurVals != null) return sum + eurVals.totalCostEur;
      return sum + holding.total_cost;
    }, 0);
  }, [holdingsWithEur, showEur]);

  const totalUnrealizedPct = totalUnrealizedGL != null && totalCost > 0
    ? (totalUnrealizedGL / totalCost) * 100
    : null;

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
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('status.columns.ticker')}</TableHead>
              <TableHead className="text-right">{t('status.columns.daysHeld')}</TableHead>
              <TableHead className="text-right">{t('status.columns.quantity')}</TableHead>
              <TableHead className="text-right">
                <div className="flex flex-col items-end">
                  <span>{t('status.columns.cost')}{showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}</span>
                  <span className="text-xs font-normal text-muted-foreground">{t('status.priceCaption')}</span>
                </div>
              </TableHead>
              <TableHead className="text-right">
                <div className="flex flex-col items-end">
                  <span>{t('status.columns.marketValue')}{showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}</span>
                  <span className="text-xs font-normal text-muted-foreground">{t('status.currentPriceCaption')}</span>
                </div>
              </TableHead>
              <TableHead className="text-right">
                {t('status.columns.unrealizedGL')}
                {showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}
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
                {formatCurrency(cashDisplay, displayCurrency, locale)}
              </TableCell>
              <TableCell className="text-right tabular-nums">-</TableCell>
            </TableRow>
            {holdingsWithEur.map(({ holding, eurVals }) => (
                <TableRow key={holding.ticker}>
                  <TableCell className="font-semibold">{holding.ticker}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {daysHeldMap[holding.ticker] == null ? '-' : formatDaysHeld(daysHeldMap[holding.ticker], daysLabels)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(holding.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{formatCurrency(holding.total_cost, 'USD', locale)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(holding.average_cost, 'USD', locale)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>
                        {(() => {
                          if (eurVals == null) {
                            return holding.current_value == null ? '-' : formatCurrency(holding.current_value, 'USD', locale);
                          }
                          return eurVals.currentValueEur == null ? '-' : formatCurrency(eurVals.currentValueEur, 'EUR', locale);
                        })()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {holding.current_price == null ? '-' : formatCurrency(holding.current_price, 'USD', locale)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(() => {
                      if (eurVals?.unrealizedGainLossEur != null && holding.unrealized_gain_loss_pct != null) {
                        return (
                          <div className="flex flex-col items-end">
                            <span className={`font-semibold ${getValueClass(eurVals.unrealizedGainLossEur)}`}>
                              {formatSignedCurrency(eurVals.unrealizedGainLossEur, 'EUR', locale)}
                            </span>
                            <span className={`text-xs ${getValueClass(eurVals.unrealizedGainLossEur)}`}>
                              {formatSignedPercent(holding.unrealized_gain_loss_pct)}
                            </span>
                          </div>
                        );
                      }
                      if (holding.unrealized_gain_loss != null && holding.unrealized_gain_loss_pct != null) {
                        return (
                          <div className="flex flex-col items-end">
                            <span className={`font-semibold ${getValueClass(holding.unrealized_gain_loss)}`}>
                              {formatSignedCurrency(holding.unrealized_gain_loss, 'USD', locale)}
                            </span>
                            <span className={`text-xs ${getValueClass(holding.unrealized_gain_loss)}`}>
                              {formatSignedPercent(holding.unrealized_gain_loss_pct)}
                            </span>
                          </div>
                        );
                      }
                      return '-';
                    })()}
                  </TableCell>
                </TableRow>
            ))}
          </TableBody>
          {totalUnrealizedGL != null && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-right font-semibold">{t('status.total')}</TableCell>
                <TableCell className={`text-right font-semibold tabular-nums ${getValueClass(totalUnrealizedGL)}`}>
                  <div className="flex flex-col items-end">
                    <span>{formatSignedCurrency(totalUnrealizedGL, showEur ? 'EUR' : 'USD', locale)}</span>
                    {totalUnrealizedPct != null && (
                      <span className={`text-xs ${getValueClass(totalUnrealizedGL)}`}>
                        {formatSignedPercent(totalUnrealizedPct)}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>
    </div>
  );
});
