import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
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

const schema = z.object({
  file: z
    .custom<File>((v) => v instanceof File, 'Please select a file')
    .refine((f) => f.name.toLowerCase().endsWith('.csv'), 'Please select a CSV file'),
});

type FormValues = z.infer<typeof schema>;

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
}

const ImportCSVModal = ({ isOpen, onClose, portfolioId }: ImportCSVModalProps) => {
  const importCSV = useImportTransactionsCSV();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const { reset } = form;
  const file = form.watch('file');

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  const onSubmit = async (values: FormValues) => {
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
          <DialogTitle>Upload Transactions CSV</DialogTitle>
          <DialogDescription className="sr-only">
            Form to upload a CSV file of transactions
          </DialogDescription>
        </DialogHeader>

        <form id="upload-csv-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">
            <Controller
              name="file"
              control={form.control}
              render={({ field: { onChange }, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="csv-file">CSV File</FieldLabel>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => onChange(e.target.files?.[0])}
                    aria-invalid={fieldState.invalid}
                  />
                  {file instanceof File && (
                    <div className="p-3 bg-muted rounded-md text-sm">
                      <strong>Selected:</strong> {file.name} ({(file.size / 1024).toFixed(2)} KB)
                    </div>
                  )}
                  <FieldDescription>
                    Expected format: date, type, ticker, quantity, price_per_share, fee,
                    total_amount, eur, split_ratio
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
            Cancel
          </Button>
          <Button
            type="submit"
            form="upload-csv-form"
            disabled={importCSV.isPending}
          >
            {importCSV.isPending ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportCSVModal;
