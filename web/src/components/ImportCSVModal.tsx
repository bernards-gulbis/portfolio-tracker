import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import i18n from '../i18n/index';
import { useTranslation } from 'react-i18next';
import { useImportTransactionsCSV } from '../hooks/useTransactions';
import { getErrorMessage, type BulkImportResponse } from '../api';
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
    if (val instanceof File) {
      if (!val.name.toLowerCase().endsWith('.csv')) {
        ctx.addIssue({ code: 'custom', message: i18n.t('transaction.csv.validation.fileMustBeCsv') });
      }
      return;
    }
    ctx.addIssue({ code: 'custom', message: i18n.t('transaction.csv.validation.fileRequired') });
  }),
});

type FormValues = { file: File | undefined };

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
}

/**
 * Two-step CSV import wizard:
 *
 *   1. Select file → click "Preview" → server-side dry-run returns counts.
 *   2. Show projected imported / skipped counts → "Confirm import" runs the
 *      real (non-dry-run) import. "Back" returns to step 1.
 *
 * The dry-run gate exists because a one-shot import that misparses date
 * formats can write hundreds of silently-wrong rows. Costing one extra
 * request to validate first is a cheap safety net.
 */
export const ImportCSVModal = ({ isOpen, onClose, portfolioId }: ImportCSVModalProps) => {
  const { t } = useTranslation();
  const importCSV = useImportTransactionsCSV();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const [preview, setPreview] = useState<BulkImportResponse | null>(null);

  const { reset } = form;
  // eslint-disable-next-line react-hooks/incompatible-library
  const file = form.watch('file');

  useEffect(() => {
    if (!isOpen) {
      reset();
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen, reset]);

  const onPreview = async (values: FormValues) => {
    if (values.file == null) return;
    try {
      const result = await importCSV.mutateAsync({
        portfolioId,
        file: values.file,
        dryRun: true,
      });
      form.clearErrors('root');
      setPreview(result);
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  const onConfirm = async () => {
    const { file } = form.getValues();
    if (file == null) return;
    try {
      await importCSV.mutateAsync({ portfolioId, file });
      onClose();
    } catch (err) {
      // Surface the error and drop back to step 1 so the user can try again.
      form.setError('root', { message: getErrorMessage(err) });
      setPreview(null);
    }
  };

  const handleBack = () => {
    setPreview(null);
    form.clearErrors('root');
  };

  const handleClose = () => {
    reset();
    setPreview(null);
    onClose();
  };

  const isPreviewStep = preview !== null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isPreviewStep ? t('transaction.csv.previewTitle') : t('transaction.csv.title')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('transaction.csv.description')}
          </DialogDescription>
        </DialogHeader>

        {isPreviewStep ? (
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">{t('transaction.csv.previewIntro')}</p>
            <ul className="space-y-2 text-sm">
              <li>
                {t('transaction.csv.previewWillImport', { count: preview.imported_count })}
              </li>
              {preview.skipped_count > 0 && (
                <li className="text-muted-foreground">
                  {t('transaction.csv.previewWillSkip', { count: preview.skipped_count })}
                </li>
              )}
            </ul>
            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <form id="upload-csv-form" onSubmit={form.handleSubmit(onPreview)}>
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
        )}

        <DialogFooter>
          {isPreviewStep ? (
            <>
              <Button type="button" variant="outline" onClick={handleBack} disabled={importCSV.isPending}>
                {t('transaction.csv.back')}
              </Button>
              <Button
                type="button"
                onClick={onConfirm}
                disabled={importCSV.isPending || preview.imported_count === 0}
              >
                {importCSV.isPending && <Spinner />}
                {t('transaction.csv.confirmImport')}
              </Button>
            </>
          ) : (
            <Button
              type="submit"
              form="upload-csv-form"
              disabled={importCSV.isPending}
            >
              {importCSV.isPending && <Spinner />}
              {t('transaction.csv.preview')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
