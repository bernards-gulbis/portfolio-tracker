import React, { useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface CollapsibleSectionProps {
  title: React.ReactNode;
  /** Optional secondary text rendered next to the title (e.g. "(FIFO)"). */
  secondary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleSection = ({
  title,
  secondary,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span>{title}</span>
        {secondary != null && (
          <span className="text-xs font-normal text-muted-foreground">{secondary}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
    </Collapsible>
  );
};
