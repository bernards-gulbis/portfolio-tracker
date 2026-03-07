import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatSignedCurrency, formatSignedPercent, formatQuantity, getValueClass } from '../utils/formatters';
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
    map[h.ticker] = Math.floor((now - new Date(h.first_buy_date).getTime()) / 86_400_000);
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
  const eurAvailable = eurMetrics !== null;
  const cashDisplay = showEur && eurAvailable ? eurMetrics.cashEur : cash;
  const currencyGainsEur = eurMetrics?.currencyGainsEur ?? null;
  const currencyGainsPct = eurMetrics?.currencyGainsPct ?? null;

  const daysHeldMap = useMemo(() => computeDaysHeld(holdings), [holdings]);

  const holdingsWithEur = useMemo(() => {
    if (!showEur || !eurAvailable) return null;
    return holdings.map((h) => ({
      holding: h,
      eurVals: applyRateToHolding(h, eurMetrics.rate),
    }));
  }, [holdings, showEur, eurAvailable, eurMetrics]);

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('status.positions')}</h3>
      {missingPrices.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertDescription>
            {t('status.missingPrices', { tickers: missingPrices.join(', ') })}
          </AlertDescription>
        </Alert>
      )}
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('status.columns.ticker')}</TableHead>
              <TableHead>{t('status.columns.quantity')}</TableHead>
              <TableHead>
                {t('status.columns.cost')}
                {showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}
              </TableHead>
              <TableHead>
                {t('status.columns.priceValue')}
                {showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}
              </TableHead>
              <TableHead>
                {t('status.columns.unrealizedGL')}
                {showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}
              </TableHead>
              <TableHead>{t('status.columns.daysHeld')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow key="CASH">
              <TableCell className="font-semibold">CASH</TableCell>
              <TableCell>-</TableCell>
              <TableCell>-</TableCell>
              <TableCell className="font-medium">
                {formatCurrency(cashDisplay, displayCurrency, locale)}
              </TableCell>
              <TableCell>
                {showEur && currencyGainsEur !== null ? (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className={`font-semibold ${getValueClass(currencyGainsEur)}`}>
                        {formatSignedCurrency(currencyGainsEur, 'EUR', locale)}
                      </span>
                      <TooltipProvider>
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
                      </TooltipProvider>
                    </div>
                    {currencyGainsPct !== null && (
                      <span className={`text-xs ${getValueClass(currencyGainsEur)}`}>
                        {formatSignedPercent(currencyGainsPct)}
                      </span>
                    )}
                  </div>
                ) : '-'}
              </TableCell>
              <TableCell>-</TableCell>
            </TableRow>
            {(holdingsWithEur ?? holdings.map((h) => ({ holding: h, eurVals: null }))).map(({ holding, eurVals }) => (
                <TableRow key={holding.ticker}>
                  <TableCell className="font-semibold">{holding.ticker}</TableCell>
                  <TableCell>{formatQuantity(holding.quantity)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{formatCurrency(holding.average_cost, 'USD', locale)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(holding.total_cost, 'USD', locale)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
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
                  <TableCell>
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
                  <TableCell>{daysHeldMap[holding.ticker] ?? '-'}</TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
});
