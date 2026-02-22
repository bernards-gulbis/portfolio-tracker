import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import { useUpdatePortfolio } from '../hooks/usePortfolios';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';

const schema = z.object({
  name: z
    .string()
    .min(1, 'Portfolio name is required')
    .max(255, 'Name must be at most 255 characters'),
});

type FormValues = z.infer<typeof schema>;

interface EditPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  currentName: string;
}

const EditPortfolioModal = ({
  isOpen,
  onClose,
  portfolioId,
  currentName,
}: EditPortfolioModalProps) => {
  const updatePortfolio = useUpdatePortfolio();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: currentName },
  });

  const { reset } = form;

  useEffect(() => {
    if (isOpen) reset({ name: currentName });
  }, [isOpen, currentName, reset]);

  const onSubmit = async (values: FormValues) => {
    if (values.name.trim() === currentName) {
      onClose();
      return;
    }
    try {
      await updatePortfolio.mutateAsync({
        portfolioId,
        data: { name: values.name.trim() },
      });
      onClose();
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleClose = () => {
    reset({ name: currentName });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Portfolio</DialogTitle>
          <DialogDescription className="sr-only">
            Form to rename this portfolio
          </DialogDescription>
        </DialogHeader>

        <form id="edit-portfolio-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="edit-portfolio-name">Portfolio Name</FieldLabel>
                  <Input
                    {...field}
                    id="edit-portfolio-name"
                    placeholder="e.g., My Investment Portfolio"
                    autoComplete="off"
                    autoFocus
                    aria-invalid={fieldState.invalid}
                  />
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
            disabled={updatePortfolio.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-portfolio-form"
            disabled={updatePortfolio.isPending}
          >
            {updatePortfolio.isPending ? 'Updating...' : 'Update Portfolio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPortfolioModal;
