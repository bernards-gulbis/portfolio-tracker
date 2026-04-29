import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const PortfolioStatusSkeleton = () => (
  <div className="space-y-4">
    {/* Stat cards */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Charts */}
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
      <Skeleton className="h-[340px] w-full rounded-lg" />
      <Skeleton className="h-[340px] w-full rounded-lg" />
    </div>

    {/* Holdings table */}
    <Card>
      <CardContent>
        <Skeleton className="h-8 w-full mb-2 rounded" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full mb-1 rounded" />
        ))}
      </CardContent>
    </Card>
  </div>
);
