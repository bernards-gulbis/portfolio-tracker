import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export interface StatCardProps {
  label: string;
  value: string;
  caption?: React.ReactNode;
}

export const StatCard = ({ label, value, caption }: StatCardProps) => (
  <Card>
    <CardContent>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {caption == null ? null : <div className="text-sm mt-1">{caption}</div>}
    </CardContent>
  </Card>
);
