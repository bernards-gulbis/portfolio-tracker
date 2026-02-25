import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import i18n from '../i18n/index';
import { useTranslation } from 'react-i18next';
import { useImportTransactionsCSV } from '../hooks/useTransactions';
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
  file: z.any().superRefine((val, ctx) => {
    if (!(val instanceof File)) {
      ctx.addIssue({ code: "custom", message: i18n.t('transaction.csv.validation.fileRequired') });
      return;
    }
    if (!val.name.toLowerCase().endsWith('.csv')) {
      ctx.addIssue({ code: "custom", message: i18n.t('transaction.csv.validation.fileMustBeCsv') });
    }
  }),
});

type FormValues = { file: File | undefined };

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
}

const ImportCSVModal = ({ isOpen, onClose, portfolioId }: ImportCSVModalProps) => {
  const { t } = useTranslation();
  const importCSV = useImportTransactionsCSV();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const { reset } = form;
  const file = form.watch('file');

  useEffect(() => {
    if (!isOpen) {
      reset();
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen, reset]);

  const onSubmit = async (values: FormValues) => {
    // Zod superRefine guarantees file is a File by the time onSubmit is called,
    // but TypeScript doesn't know that — narrow here so the type is File.
    if (!values.file) return;
    try {
      await importCSV.mutateAsync({ portfolioId, file: values.file });
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
          <DialogTitle>{t('transaction.csv.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('transaction.csv.description')}
          </DialogDescription>
        </DialogHeader>

        <form id="upload-csv-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Controller
              name="file"
              control={form.control}
              render={({ field: { onChange }, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="csv-file">{t('transaction.csv.fileLabel')}</FieldLabel>
                  <Input
                    ref={fileInputRef}
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={(e) => onChange(e.target.files?.[0])}
                    aria-invalid={fieldState.invalid}
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importCSV.isPending}
                    >
                      {t('transaction.csv.chooseFile')}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {file instanceof File
                        ? `${file.name} (${(file.size / 1024).toFixed(2)} KB)`
                        : t('transaction.csv.noFileChosen')}
                    </span>
                  </div>
                  <FieldDescription>
                    {t('transaction.csv.fileDescription')}
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
            disabled={importCSV.isPending}
          >
            {t('transaction.csv.cancel')}
          </Button>
          <Button
            type="submit"
            form="upload-csv-form"
            disabled={importCSV.isPending}
          >
            {importCSV.isPending && <Spinner />}
            {t('transaction.csv.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportCSVModal;
