import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholder mirroring the redesigned summary layout: the wide hero
 * card (value + sparkline + 4 KPI tiles), the chart grid, and the holdings
 * table. Keeping the skeleton shape close to the real layout avoids a visible
 * reflow once data arrives.
 */
export const PortfolioStatusSkeleton = () => (
  <div className="space-y-4">
    {/* Toolbar slot */}
    <div className="flex justify-end">
      <Skeleton className="h-8 w-44 rounded" />
    </div>

    {/* Hero card */}
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-16 w-40 rounded" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 border-t pt-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    {/* Charts */}
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
      <Skeleton className="h-[340px] w-full rounded-lg" />
      <Skeleton className="h-[340px] w-full rounded-lg" />
    </div>

    {/* Holdings table */}
    <Card>
      <CardContent>
        <Skeleton className="h-8 w-full mb-2 rounded" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full mb-1 rounded" />
        ))}
      </CardContent>
    </Card>
  </div>
);
