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
import { formatCurrency, formatDate, formatQuantity } from '../utils/formatters';

export const AnalyzePage = () => {
  const { t } = useTranslation();
  const locale = useLocale();
  const portfolioId = useActivePortfolioId();
  const { data, isLoading, error } = useRealizedSales(portfolioId);

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
            {formatCurrency(data.total_realized_gain_loss, 'USD', locale)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.sales.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{t('analyze.noSells')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('analyze.columns.date')}</TableHead>
                  <TableHead>{t('analyze.columns.ticker')}</TableHead>
                  <TableHead className="text-right">{t('analyze.columns.quantity')}</TableHead>
                  <TableHead className="text-right">{t('analyze.columns.proceeds')}</TableHead>
                  <TableHead className="text-right">{t('analyze.columns.costBasis')}</TableHead>
                  <TableHead className="text-right">{t('analyze.columns.gainLoss')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sales.map((sale) => (
                  <TableRow key={sale.transaction_id}>
                    <TableCell className="whitespace-nowrap">{formatDate(sale.date, locale)}</TableCell>
                    <TableCell className="font-medium">{sale.ticker}</TableCell>
                    <TableCell className="text-right">{formatQuantity(sale.quantity)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(sale.sale_proceeds, 'USD', locale)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(sale.cost_basis, 'USD', locale)}</TableCell>
                    <TableCell className="text-right">
                      <span className={sale.realized_gain_loss >= 0 ? 'text-positive' : 'text-negative'}>
                        {formatCurrency(sale.realized_gain_loss, 'USD', locale)}
                        {sale.realized_gain_loss_pct !== null && (
                          <span className="text-xs ml-1">
                            ({sale.realized_gain_loss_pct >= 0 ? '+' : ''}{sale.realized_gain_loss_pct.toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
