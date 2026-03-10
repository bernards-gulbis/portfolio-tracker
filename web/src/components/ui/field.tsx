import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import type { FieldError as RHFFieldError } from 'react-hook-form';

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn('space-y-4', className)} {...props} />;
}

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field" className={cn('space-y-2', className)} {...props} />;
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn(className)} {...props} />;
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

function FieldError({
  className,
  errors,
  ...props
}: React.ComponentProps<"p"> & { errors?: (RHFFieldError | undefined)[] }) {
  const messages = errors?.flatMap((e) => (e?.message ? [e.message] : [])) ?? [];
  if (messages.length === 0) return null;
  return (
    <p data-slot="field-error" className={cn('text-sm text-destructive', className)} {...props}>
      {messages[0]}
    </p>
  );
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel };
