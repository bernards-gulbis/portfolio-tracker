import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useUpdatePortfolio } from '../hooks/usePortfolios';
import { getErrorMessage } from '../api';
import { portfolioNameSchema, PortfolioNameValues } from '../utils/portfolioNameSchema';
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
import { Spinner } from '@/components/ui/spinner';

interface EditPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  currentName: string;
}

export const EditPortfolioModal = ({
  isOpen,
  onClose,
  portfolioId,
  currentName,
}: EditPortfolioModalProps) => {
  const { t } = useTranslation();
  const updatePortfolio = useUpdatePortfolio();
  const form = useForm<PortfolioNameValues>({
    resolver: zodResolver(portfolioNameSchema),
    defaultValues: { name: currentName },
  });

  const { reset } = form;

  useEffect(() => {
    if (isOpen) reset({ name: currentName });
  }, [isOpen, currentName, reset]);

  const onSubmit = async (values: PortfolioNameValues) => {
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
          <DialogTitle>{t('portfolio.edit.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('portfolio.edit.description')}
          </DialogDescription>
        </DialogHeader>

        <form id="edit-portfolio-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="edit-portfolio-name">{t('portfolio.edit.nameLabel')}</FieldLabel>
                  <Input
                    {...field}
                    id="edit-portfolio-name"
                    placeholder={t('portfolio.edit.namePlaceholder')}
                    autoComplete="off"
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
            type="submit"
            form="edit-portfolio-form"
            disabled={updatePortfolio.isPending}
          >
            {updatePortfolio.isPending && <Spinner />}
            {t('portfolio.edit.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
