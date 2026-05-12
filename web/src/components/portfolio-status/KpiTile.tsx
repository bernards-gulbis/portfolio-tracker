import React from 'react';
import { InfoIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface KpiTileProps {
  label: string;
  value: string;
  caption?: React.ReactNode;
  /** When provided, an info icon is rendered next to the label that reveals the tooltip on hover. */
  tooltip?: React.ReactNode;
  /** Tailwind class to colour the value (e.g. ``text-positive`` / ``text-negative``). */
  valueClass?: string;
  /** Optional short context chip rendered next to the label (e.g. "Since 2021"). */
  scopeChip?: React.ReactNode;
}

export const KpiTile = ({ label, value, caption, tooltip, valueClass, scopeChip }: KpiTileProps) => {
  const labelNode = (
    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <span>{label}</span>
      {tooltip != null && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon
                aria-label={label}
                className="h-3 w-3 text-muted-foreground cursor-help"
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {scopeChip != null && (
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
          {scopeChip}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      {labelNode}
      <p className={`text-lg font-semibold tabular-nums leading-tight ${valueClass ?? ''}`}>
        {value}
      </p>
      {caption != null && <div className="text-xs leading-tight">{caption}</div>}
    </div>
  );
};
