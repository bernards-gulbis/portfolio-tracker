import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import type { FieldError as RHFFieldError } from 'react-hook-form';

const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-4', className)} {...props} />
  )
);
FieldGroup.displayName = 'FieldGroup';

const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props} />
  )
);
Field.displayName = 'Field';

const FieldLabel = React.forwardRef<
  React.ComponentRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => (
  <Label ref={ref} className={cn(className)} {...props} />
));
FieldLabel.displayName = 'FieldLabel';

const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-xs text-muted-foreground', className)} {...props} />
));
FieldDescription.displayName = 'FieldDescription';

interface FieldErrorProps extends React.HTMLAttributes<HTMLParagraphElement> {
  errors?: (RHFFieldError | undefined)[];
}

const FieldError = React.forwardRef<HTMLParagraphElement, FieldErrorProps>(
  ({ className, errors, ...props }, ref) => {
    const messages = errors?.flatMap((e) => (e?.message ? [e.message] : [])) ?? [];
    if (messages.length === 0) return null;
    return (
      <p ref={ref} className={cn('text-sm text-destructive', className)} {...props}>
        {messages[0]}
      </p>
    );
  }
);
FieldError.displayName = 'FieldError';

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel };
