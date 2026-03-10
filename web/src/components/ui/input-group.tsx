import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="input-group" className={cn('flex w-full', className)} {...props} />;
}

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<"div"> & { align?: 'inline-start' | 'inline-end' | 'block-end' }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        'border-input bg-muted text-muted-foreground flex h-9 shrink-0 items-center border px-3 text-sm',
        align === 'inline-start' && 'rounded-l-md border-r-0',
        align === 'inline-end' && 'rounded-r-md border-l-0',
        align === 'block-end' && 'w-full rounded-b-md border-t-0 px-3 py-2',
        className
      )}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="input-group-text" className={cn('select-none', className)} {...props} />;
}

function InputGroupInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input data-slot="input-group-input" className={cn('rounded-none', className)} {...props} />;
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground dark:bg-input/30 flex w-full border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm rounded-none',
        className
      )}
      {...props}
    />
  );
}

function InputGroupButton({ className, type = 'button', ...props }: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="input-group-button"
      type={type}
      className={cn(
        'inline-flex h-full w-9 cursor-pointer items-center justify-center transition-colors',
        'text-muted-foreground hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0',
        className
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
