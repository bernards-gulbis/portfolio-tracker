import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { useCreatePortfolio } from '../hooks/usePortfolios';
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

type FormValues = { name: string };

interface CreatePortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreatePortfolioModal = ({ isOpen, onClose }: CreatePortfolioModalProps) => {
  const { t } = useTranslation();
  const schema = useMemo(() => z.object({
    name: z.string()
      .min(1, t('portfolio.validation.nameRequired'))
      .max(255, t('portfolio.validation.nameTooLong')),
  }), [t]);
  const createPortfolio = useCreatePortfolio();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  const { reset } = form;

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      await createPortfolio.mutateAsync({ name: values.name.trim() });
      onClose();
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('portfolio.create.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('portfolio.create.description')}
          </DialogDescription>
        </DialogHeader>

        <form id="create-portfolio-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="create-portfolio-name">{t('portfolio.create.nameLabel')}</FieldLabel>
                  <Input
                    {...field}
                    id="create-portfolio-name"
                    placeholder={t('portfolio.create.namePlaceholder')}
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
            disabled={createPortfolio.isPending}
          >
            {t('portfolio.create.cancel')}
          </Button>
          <Button
            type="submit"
            form="create-portfolio-form"
            disabled={createPortfolio.isPending}
          >
            {createPortfolio.isPending ? t('portfolio.create.submitting') : t('portfolio.create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePortfolioModal;
