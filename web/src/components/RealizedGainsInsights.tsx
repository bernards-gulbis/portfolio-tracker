import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUpIcon, TrendingDownIcon, RepeatIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatSignedCurrency, formatSignedPercent, getValueClass } from '../utils/formatters';
import type { TickerGroup } from '../hooks/useRealizedGainsData';

// ================== Types ==================

interface InsightEntry {
  ticker: string;
  gain: number;
  sellCount: number;
  returnPct: number | null;
}

// ================== InsightItem ==================

interface InsightItemProps {
  entry: InsightEntry;
  locale: string;
  showReturn: boolean;
}

function InsightItem({ entry, locale, showReturn }: InsightItemProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{entry.ticker}</span>
        <span className="text-xs text-muted-foreground">
          {t('status.sellCount', { count: entry.sellCount })}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className={`text-sm font-medium tabular-nums ${getValueClass(entry.gain)}`}>
          {formatSignedCurrency(entry.gain, 'USD', locale)}
        </span>
        {showReturn && entry.returnPct != null && (
          <span className={`text-xs font-bold tabular-nums ${getValueClass(entry.returnPct)}`}>
            {formatSignedPercent(entry.returnPct)}
          </span>
        )}
      </div>
    </div>
  );
}

// ================== InsightCard ==================

interface InsightCardProps {
  title: string;
  icon: React.ReactNode;
  entries: InsightEntry[];
  locale: string;
  showReturn: boolean;
}

function InsightCard({ title, icon, entries, locale, showReturn }: InsightCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('status.insights.noData')}</p>
      ) : (
        <div className="divide-y">
          {entries.map((entry) => (
            <InsightItem key={entry.ticker} entry={entry} locale={locale} showReturn={showReturn} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ================== RealizedGainsInsights ==================

interface RealizedGainsInsightsProps {
  filteredGains: TickerGroup[];
  locale: string;
}

function toEntry(group: TickerGroup): InsightEntry {
  const totalCostBasis = group.sales.reduce((sum, s) => sum + s.cost_basis, 0);
  return {
    ticker: group.ticker,
    gain: group.totalGain,
    sellCount: group.sales.length,
    returnPct: totalCostBasis > 0 ? (group.totalGain / totalCostBasis) * 100 : null,
  };
}

export function RealizedGainsInsights({ filteredGains, locale }: RealizedGainsInsightsProps) {
  const { t } = useTranslation();

  const { winners, losers, mostTraded } = useMemo(() => {
    const entries = filteredGains.map(toEntry);

    const winnersArr = entries
      .filter((e) => e.gain > 0)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 3);

    const losersArr = entries
      .filter((e) => e.gain < 0)
      .sort((a, b) => a.gain - b.gain)
      .slice(0, 3);

    const mostTradedArr = [...entries]
      .sort((a, b) => b.sellCount - a.sellCount)
      .slice(0, 3);

    return { winners: winnersArr, losers: losersArr, mostTraded: mostTradedArr };
  }, [filteredGains]);

  if (filteredGains.length < 2) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <InsightCard
        title={t('status.insights.topWinners')}
        icon={<TrendingUpIcon className="h-4 w-4 text-positive" />}
        entries={winners}
        locale={locale}
        showReturn
      />
      <InsightCard
        title={t('status.insights.topLosers')}
        icon={<TrendingDownIcon className="h-4 w-4 text-negative" />}
        entries={losers}
        locale={locale}
        showReturn
      />
      <InsightCard
        title={t('status.insights.mostTraded')}
        icon={<RepeatIcon className="h-4 w-4 text-muted-foreground" />}
        entries={mostTraded}
        locale={locale}
        showReturn={false}
      />
    </div>
  );
}
