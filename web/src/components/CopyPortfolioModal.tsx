import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import i18n from '../i18n/index';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
import { Spinner } from '@/components/ui/spinner';

const schema = z.object({
  name: z.string().superRefine((val, ctx) => {
    if (val.trim().length < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: i18n.t('portfolio.validation.nameRequired') });
    } else if (val.trim().length > 255) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: i18n.t('portfolio.validation.nameTooLong') });
    }
  }),
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
  const navigate = useNavigate();
  const copyPortfolio = useCopyPortfolio();
  const defaultName = t('portfolio.copy.defaultName', { name: portfolioName });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: defaultName },
  });

  const { reset } = form;

  useEffect(() => {
    if (isOpen) reset({ name: defaultName });
  }, [isOpen, defaultName, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const copied = await copyPortfolio.mutateAsync({ portfolioId, newName: values.name.trim() });
      onClose();
      navigate(`/portfolios/${copied.id}`);
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleClose = () => {
    reset({ name: defaultName });
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
            {copyPortfolio.isPending && <Spinner />}
            {t('portfolio.copy.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyPortfolioModal;
