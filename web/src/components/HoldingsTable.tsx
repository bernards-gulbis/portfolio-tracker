import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatSignedCurrency, formatQuantity, getValueClass } from '../utils/formatters';
import { applyRateToHolding, type EurMetrics } from '../utils/eurMetrics';
import type { Holding } from '../api';
import type { Currency } from '../hooks/useCurrencyPreference';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangleIcon } from 'lucide-react';

interface HoldingsTableProps {
  holdings: Holding[];
  missingPrices: string[];
  cash: number;
  displayCurrency: Currency;
  showEur: boolean;
  eurMetrics: EurMetrics | null;
  currencyGainsEur: number | null;
  currencyGainsPct: number | null;
  locale: string;
}

export const HoldingsTable = memo(({
  holdings,
  missingPrices,
  cash,
  displayCurrency,
  showEur,
  eurMetrics,
  currencyGainsEur,
  currencyGainsPct,
  locale,
}: HoldingsTableProps) => {
  const { t } = useTranslation();
  const eurAvailable = eurMetrics !== null;
  const cashDisplay = showEur && eurAvailable ? eurMetrics!.cashEur : cash;

  const holdingsWithEur = useMemo(() => {
    if (!showEur || !eurAvailable) return null;
    return holdings.map((h) => ({
      holding: h,
      eurVals: applyRateToHolding(h, eurMetrics!.rate),
    }));
  }, [holdings, showEur, eurAvailable, eurMetrics]);

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('status.positions')}</h3>
      {missingPrices.length > 0 && (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertDescription>
            {t('status.missingPrices', { tickers: missingPrices.join(', ') })}
          </AlertDescription>
        </Alert>
      )}
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('status.columns.ticker')}</TableHead>
              <TableHead>{t('status.columns.quantity')}</TableHead>
              <TableHead>
                {t('status.columns.avgCost')}
                {showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}
              </TableHead>
              <TableHead>
                {t('status.columns.totalCost')}
                {showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}
              </TableHead>
              <TableHead>
                {t('status.columns.currentPrice')}
                {showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}
              </TableHead>
              <TableHead>
                {t('status.columns.marketValue')}
                {showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}
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
              <TableCell>-</TableCell>
              <TableCell>-</TableCell>
              <TableCell>-</TableCell>
              <TableCell>-</TableCell>
              <TableCell>
                {formatCurrency(cashDisplay, displayCurrency, locale)}
              </TableCell>
              <TableCell>
                {currencyGainsEur !== null ? (
                  <div className="flex flex-col">
                    <span className={`font-semibold ${getValueClass(currencyGainsEur)}`}>
                      {formatSignedCurrency(currencyGainsEur, 'EUR', locale)}
                    </span>
                    {currencyGainsPct !== null && (
                      <span className={`text-xs ${getValueClass(currencyGainsEur)}`}>
                        {currencyGainsPct >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(currencyGainsPct).toFixed(2)}%
                      </span>
                    )}
                  </div>
                ) : '-'}
              </TableCell>
            </TableRow>
            {(holdingsWithEur ?? holdings.map((h) => ({ holding: h, eurVals: null }))).map(({ holding, eurVals }) => (
              <TableRow key={holding.ticker}>
                <TableCell className="font-semibold">{holding.ticker}</TableCell>
                <TableCell>{formatQuantity(holding.quantity)}</TableCell>
                <TableCell>{formatCurrency(holding.average_cost, 'USD', locale)}</TableCell>
                <TableCell>{formatCurrency(holding.total_cost, 'USD', locale)}</TableCell>
                <TableCell>
                  {holding.current_price == null ? '-' : formatCurrency(holding.current_price, 'USD', locale)}
                </TableCell>
                <TableCell className="font-medium">
                  {eurVals != null
                    ? (eurVals.current_value_eur != null ? formatCurrency(eurVals.current_value_eur, 'EUR', locale) : '-')
                    : (holding.current_value == null ? '-' : formatCurrency(holding.current_value, 'USD', locale))}
                </TableCell>
                <TableCell>
                  {eurVals != null && eurVals.unrealized_gain_loss_eur != null && holding.unrealized_gain_loss_pct != null
                    ? (
                      <div className="flex flex-col">
                        <span className={`font-semibold ${getValueClass(eurVals.unrealized_gain_loss_eur)}`}>
                          {formatSignedCurrency(eurVals.unrealized_gain_loss_eur, 'EUR', locale)}
                        </span>
                        <span className={`text-xs ${getValueClass(eurVals.unrealized_gain_loss_eur)}`}>
                          {holding.unrealized_gain_loss_pct >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(holding.unrealized_gain_loss_pct).toFixed(2)}%
                        </span>
                      </div>
                    )
                    : holding.unrealized_gain_loss != null && holding.unrealized_gain_loss_pct != null
                      ? (
                        <div className="flex flex-col">
                          <span className={`font-semibold ${getValueClass(holding.unrealized_gain_loss)}`}>
                            {formatSignedCurrency(holding.unrealized_gain_loss, 'USD', locale)}
                          </span>
                          <span className={`text-xs ${getValueClass(holding.unrealized_gain_loss)}`}>
                            {holding.unrealized_gain_loss_pct >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(holding.unrealized_gain_loss_pct).toFixed(2)}%
                          </span>
                        </div>
                      )
                      : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
});
