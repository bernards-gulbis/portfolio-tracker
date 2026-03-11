import * as React from 'react';
import { cn } from '@/lib/utils';

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn('flex flex-col items-center gap-4 py-12 text-center', className)}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn('flex flex-col items-center gap-2', className)}
      {...props}
    />
  );
}

function EmptyMedia({
  className,
  variant = 'icon',
  ...props
}: React.ComponentProps<"div"> & { variant?: 'icon' | 'image' }) {
  return (
    <div
      data-slot="empty-media"
      className={cn(
        'flex items-center justify-center',
        variant === 'icon' &&
          'rounded-full bg-muted p-3 text-muted-foreground [&>svg]:size-6',
        className
      )}
      {...props}
    />
  );
}

function EmptyTitle({
  className,
  children,
  ...props
}: React.ComponentProps<"h3">) {
  if (!children) return null;
  return (
    <h3
      data-slot="empty-title"
      className={cn('text-base font-semibold', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn('max-w-xs text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn('flex flex-col items-center gap-2', className)}
      {...props}
    />
  );
}

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent };
