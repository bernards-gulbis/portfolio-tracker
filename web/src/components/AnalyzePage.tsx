import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { useRealizedSales } from '../hooks/useRealizedSales';
import { getErrorMessage } from '../api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLocale } from '../hooks/useLocale';
import { formatCurrency, formatSignedCurrency } from '../utils/formatters';

interface TickerGroup {
  ticker: string;
  sellCount: number;
  totalProceeds: number;
  totalCostBasis: number;
  totalGain: number;
  gainPct: number | null;
}

export const AnalyzePage = () => {
  const { t } = useTranslation();
  const locale = useLocale();
  const portfolioId = useActivePortfolioId();
  const { data, isLoading, error } = useRealizedSales(portfolioId);

  const grouped = useMemo<TickerGroup[]>(() => {
    if (!data) return [];
    const map = new Map<string, TickerGroup>();
    for (const sale of data.sales) {
      const existing = map.get(sale.ticker);
      if (existing) {
        existing.sellCount += 1;
        existing.totalProceeds += sale.sale_proceeds;
        existing.totalCostBasis += sale.cost_basis;
        existing.totalGain += sale.realized_gain_loss;
      } else {
        map.set(sale.ticker, {
          ticker: sale.ticker,
          sellCount: 1,
          totalProceeds: sale.sale_proceeds,
          totalCostBasis: sale.cost_basis,
          totalGain: sale.realized_gain_loss,
          gainPct: null,
        });
      }
    }
    const rows = Array.from(map.values()).map((g) => ({
      ...g,
      gainPct: g.totalCostBasis !== 0 ? (g.totalGain / g.totalCostBasis) * 100 : null,
    }));
    rows.sort((a, b) => b.totalGain - a.totalGain);
    return rows;
  }, [data]);

  if (!portfolioId) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">{t('status.noPortfolio')}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-destructive">{t('analyze.error', { message: getErrorMessage(error) })}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analyze.realizedGains')}</CardTitle>
        <CardDescription>
          {t('analyze.totalGainLoss')}:{' '}
          <span className={data.total_realized_gain_loss >= 0 ? 'text-positive' : 'text-negative'}>
            {formatSignedCurrency(data.total_realized_gain_loss, 'USD', locale)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {grouped.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{t('analyze.noSells')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('analyze.columns.ticker')}</TableHead>
                  <TableHead className="text-right">{t('analyze.columns.sells')}</TableHead>
                  <TableHead className="text-right">{t('analyze.columns.proceeds')}</TableHead>
                  <TableHead className="text-right">{t('analyze.columns.costBasis')}</TableHead>
                  <TableHead className="text-right">{t('analyze.columns.gainLoss')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((row) => {
                  const colorClass = row.totalGain >= 0 ? 'text-positive' : 'text-negative';
                  return (
                    <TableRow key={row.ticker}>
                      <TableCell className="font-medium">{row.ticker}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{row.sellCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalProceeds, 'USD', locale)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalCostBasis, 'USD', locale)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={`font-semibold ${colorClass}`}>
                            {formatSignedCurrency(row.totalGain, 'USD', locale)}
                          </span>
                          {row.gainPct !== null && (
                            <span className={`text-xs ${colorClass}`}>
                              {row.gainPct >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(row.gainPct).toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
