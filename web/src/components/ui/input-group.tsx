import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex w-full', className)} {...props} />
  )
);
InputGroup.displayName = 'InputGroup';

interface InputGroupAddonProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'inline-start' | 'inline-end' | 'block-end';
}

const InputGroupAddon = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ className, align = 'inline-start', ...props }, ref) => (
    <div
      ref={ref}
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
  )
);
InputGroupAddon.displayName = 'InputGroupAddon';

const InputGroupText = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn('select-none', className)} {...props} />
));
InputGroupText.displayName = 'InputGroupText';

const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof Input>
>(({ className, ...props }, ref) => (
  <Input ref={ref} className={cn('rounded-none', className)} {...props} />
));
InputGroupInput.displayName = 'InputGroupInput';

const InputGroupTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'border-input placeholder:text-muted-foreground dark:bg-input/30 flex w-full border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm rounded-none',
      className
    )}
    {...props}
  />
));
InputGroupTextarea.displayName = 'InputGroupTextarea';

const InputGroupButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type = 'button', ...props }, ref) => (
  <button
    ref={ref}
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
));
InputGroupButton.displayName = 'InputGroupButton';

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
