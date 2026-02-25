import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import i18n from '../i18n/index';
import { useTranslation } from 'react-i18next';
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
import { Spinner } from '@/components/ui/spinner';

const schema = z.object({
  name: z.string().superRefine((val, ctx) => {
    if (val.trim().length < 1) {
      ctx.addIssue({ code: "custom", message: i18n.t('portfolio.validation.nameRequired') });
    } else if (val.trim().length > 255) {
      ctx.addIssue({ code: "custom", message: i18n.t('portfolio.validation.nameTooLong') });
    }
  }),
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
  const { t } = useTranslation();
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
            {t('portfolio.edit.cancel')}
          </Button>
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

export default EditPortfolioModal;
