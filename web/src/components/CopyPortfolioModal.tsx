import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const copyPortfolio = useCopyPortfolio();
  const defaultName = t('portfolio.copy.defaultName', { name: portfolioName });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: defaultName },
  });

  const { reset } = form;

  useEffect(() => {
    if (isOpen) reset({ name: t('portfolio.copy.defaultName', { name: portfolioName }) });
  }, [isOpen, portfolioName, reset, t]);

  const onSubmit = async (values: FormValues) => {
    try {
      await copyPortfolio.mutateAsync({ portfolioId, newName: values.name.trim() });
      onClose();
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleClose = () => {
    reset({ name: t('portfolio.copy.defaultName', { name: portfolioName }) });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('portfolio.copy.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('portfolio.copy.description')}
          </DialogDescription>
        </DialogHeader>

        <form id="copy-portfolio-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="copy-portfolio-name">{t('portfolio.copy.nameLabel')}</FieldLabel>
                  <Input
                    {...field}
                    id="copy-portfolio-name"
                    placeholder={t('portfolio.copy.namePlaceholder')}
                    autoComplete="off"
                    autoFocus
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    {t('portfolio.copy.nameDescription', { name: portfolioName })}
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
            {t('portfolio.copy.cancel')}
          </Button>
          <Button
            type="submit"
            form="copy-portfolio-form"
            disabled={copyPortfolio.isPending}
          >
            {copyPortfolio.isPending ? t('portfolio.copy.submitting') : t('portfolio.copy.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyPortfolioModal;
