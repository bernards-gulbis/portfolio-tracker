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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';

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
  const currencyGainsEur = eurMetrics?.currencyGainsEur ?? null;
  const currencyGainsPct = eurMetrics?.currencyGainsPct ?? null;

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
      <TooltipProvider>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('status.columns.ticker')}</TableHead>
              <TableHead>{t('status.columns.daysHeld')}</TableHead>
              <TableHead>{t('status.columns.quantity')}</TableHead>
              <TableHead>
                <div className="flex flex-col">
                  <span>{t('status.columns.cost')}{showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">{t('status.priceCaption')}</span>
                </div>
              </TableHead>
              <TableHead>
                <div className="flex flex-col">
                  <span>{t('status.columns.marketValue')}{showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">{t('status.priceCaption')}</span>
                </div>
              </TableHead>
              <TableHead>
                {t('status.columns.unrealizedGL')}
                {showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow key="CASH">
              <TableCell className="font-semibold">CASH</TableCell>
              <TableCell className="tabular-nums">-</TableCell>
              <TableCell className="tabular-nums">-</TableCell>
              <TableCell className="tabular-nums">-</TableCell>
              <TableCell className="font-medium tabular-nums">
                {formatCurrency(cashDisplay, displayCurrency, locale)}
              </TableCell>
              <TableCell className="tabular-nums">
                {showEur && currencyGainsEur !== null ? (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className={`font-semibold ${getValueClass(currencyGainsEur)}`}>
                        {formatSignedCurrency(currencyGainsEur, 'EUR', locale)}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground cursor-help">
                            {t('status.fx')}
                            <InfoIcon className="h-3 w-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('status.cashFxTooltip')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {currencyGainsPct !== null && (
                      <span className={`text-xs ${getValueClass(currencyGainsEur)}`}>
                        {formatSignedPercent(currencyGainsPct)}
                      </span>
                    )}
                  </div>
                ) : '-'}
              </TableCell>
            </TableRow>
            {holdingsWithEur.map(({ holding, eurVals }) => (
                <TableRow key={holding.ticker}>
                  <TableCell className="font-semibold">{holding.ticker}</TableCell>
                  <TableCell className="tabular-nums">
                    {daysHeldMap[holding.ticker] == null ? '-' : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help border-b border-dotted border-muted-foreground">
                            {formatDaysHeld(daysHeldMap[holding.ticker], daysLabels)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{daysHeldMap[holding.ticker]} {t('status.columns.daysHeld').toLocaleLowerCase()}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatQuantity(holding.quantity)}</TableCell>
                  <TableCell className="tabular-nums">
                    <div className="flex flex-col">
                      <span>{formatCurrency(holding.total_cost, 'USD', locale)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(holding.average_cost, 'USD', locale)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    <div className="flex flex-col">
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
                  <TableCell className="tabular-nums">
                    {(() => {
                      if (eurVals?.unrealizedGainLossEur != null && holding.unrealized_gain_loss_pct != null) {
                        return (
                          <div className="flex flex-col">
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
                          <div className="flex flex-col">
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
        </Table>
      </Card>
      </TooltipProvider>
    </div>
  );
});
