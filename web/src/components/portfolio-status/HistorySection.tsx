import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { DividendReceived, RealizedSale, WithdrawalFx } from '../../api';
import type { Currency } from '../../hooks/useCurrencyPreference';
import { ErrorBoundary } from '../ErrorBoundary';
import { DividendsReceivedTable, RealizedGainsTable } from '../RealizedGainsTable';
import { WithdrawalsTable } from '../WithdrawalsTable';

import { CollapsibleSection } from './CollapsibleSection';

export interface HistorySectionProps {
  realizedSales: RealizedSale[];
  dividendsReceived: DividendReceived[];
  realizedWithdrawals: WithdrawalFx[];
  displayCurrency: Currency;
  locale: string;
  principalEur: number | null;
  dividendsEur: number | null;
  taxRate: number;
}

type TabValue = 'realized-gains' | 'dividends' | 'withdrawals';

const EmptyState = ({ message }: { message: string }) => (
  <div className="py-10 text-center text-sm text-muted-foreground">{message}</div>
);

export const HistorySection = ({
  realizedSales,
  dividendsReceived,
  realizedWithdrawals,
  displayCurrency,
  locale,
  principalEur,
  dividendsEur,
  taxRate,
}: HistorySectionProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabValue>('realized-gains');

  const salesCount = realizedSales.length;
  const dividendsCount = dividendsReceived.length;
  const withdrawalsCount = realizedWithdrawals.length;

  const summarySegments = [
    salesCount > 0 ? t('status.historySummary.sales', { count: salesCount }) : null,
    dividendsCount > 0
      ? t('status.historySummary.dividends', { count: dividendsCount })
      : null,
    withdrawalsCount > 0
      ? t('status.historySummary.withdrawals', { count: withdrawalsCount })
      : null,
  ].filter((s): s is string => s != null);

  const summary = summarySegments.length === 0 ? null : summarySegments.join(' · ');

  return (
    <CollapsibleSection title={t('status.history')} summary={summary} defaultOpen>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList variant="line" className="mb-2">
          <TabsTrigger value="realized-gains">
            {t('status.historyTab.realizedGains')}
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 tabular-nums">
              {salesCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="dividends">
            {t('status.historyTab.dividends')}
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 tabular-nums">
              {dividendsCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="withdrawals">
            {t('status.historyTab.withdrawals')}
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 tabular-nums">
              {withdrawalsCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="realized-gains"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          {salesCount === 0 ? (
            <EmptyState message={t('status.noRealizedGains')} />
          ) : (
            <ErrorBoundary fullScreen={false}>
              <RealizedGainsTable realizedSales={realizedSales} locale={locale} />
            </ErrorBoundary>
          )}
        </TabsContent>

        <TabsContent
          value="dividends"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          {dividendsCount === 0 ? (
            <EmptyState message={t('status.noDividends')} />
          ) : (
            <ErrorBoundary fullScreen={false}>
              <DividendsReceivedTable
                dividendsReceived={dividendsReceived}
                displayCurrency={displayCurrency}
                locale={locale}
              />
            </ErrorBoundary>
          )}
        </TabsContent>

        <TabsContent
          value="withdrawals"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          {withdrawalsCount === 0 ? (
            <EmptyState message={t('status.noWithdrawals')} />
          ) : (
            <ErrorBoundary fullScreen={false}>
              <WithdrawalsTable
                realizedWithdrawals={realizedWithdrawals}
                locale={locale}
                principalEur={principalEur}
                dividendsEur={dividendsEur}
                taxRate={taxRate}
              />
            </ErrorBoundary>
          )}
        </TabsContent>
      </Tabs>
    </CollapsibleSection>
  );
};
