import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import { useCopyPortfolio } from '../hooks/usePortfolios';
import { getErrorMessage } from '../api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';

const schema = z.object({
  name: z
    .string()
    .min(1, 'Portfolio name is required')
    .max(255, 'Name must be at most 255 characters'),
});

type FormValues = z.infer<typeof schema>;

interface CopyPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  portfolioName: string;
}

const CopyPortfolioModal = ({
  isOpen,
  onClose,
  portfolioId,
  portfolioName,
}: CopyPortfolioModalProps) => {
  const copyPortfolio = useCopyPortfolio();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: `${portfolioName} (Copy)` },
  });

  const { reset } = form;

  useEffect(() => {
    if (isOpen) reset({ name: `${portfolioName} (Copy)` });
  }, [isOpen, portfolioName, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      await copyPortfolio.mutateAsync({ portfolioId, newName: values.name.trim() });
      onClose();
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleClose = () => {
    reset({ name: `${portfolioName} (Copy)` });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy Portfolio</DialogTitle>
          <DialogDescription className="sr-only">
            Form to copy this portfolio with all its transactions
          </DialogDescription>
        </DialogHeader>

        <form id="copy-portfolio-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="copy-portfolio-name">New Portfolio Name</FieldLabel>
                  <Input
                    {...field}
                    id="copy-portfolio-name"
                    placeholder="Enter new portfolio name"
                    autoFocus
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    This will copy &ldquo;{portfolioName}&rdquo; with all its transactions.
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={copyPortfolio.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="copy-portfolio-form"
            disabled={copyPortfolio.isPending}
          >
            {copyPortfolio.isPending ? 'Copying...' : 'Copy Portfolio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyPortfolioModal;
