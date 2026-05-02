import * as z from 'zod';
import i18n from '../../i18n/index';
import { nameField } from '../../utils/portfolioNameSchema';

export const SECTIONS = ['profile', 'password', 'tax', 'account'] as const;
export type SettingsSection = (typeof SECTIONS)[number];

export const profileSchema = z.object({
  name: nameField('settings.validation.nameRequired', 'settings.validation.nameTooLong'),
});
export type ProfileFormValues = z.infer<typeof profileSchema>;

export const passwordSchema = z
  .object({
    newPassword: z.string().min(8, { message: i18n.t('settings.validation.passwordMinLength') }),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword.length >= 8 && data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: i18n.t('settings.validation.passwordsDoNotMatch'),
        path: ['confirmPassword'],
      });
    }
  });
export type PasswordFormValues = z.infer<typeof passwordSchema>;

export const taxSchema = z.object({
  taxRate: z
    .number()
    .min(0, { message: i18n.t('settings.validation.taxRateMin') })
    .max(100, { message: i18n.t('settings.validation.taxRateMax') }),
});
export type TaxFormValues = z.infer<typeof taxSchema>;

export const closeAccountPasswordSchema = z.object({
  password: z.string().min(1, { message: i18n.t('settings.validation.passwordRequired') }),
});
export type CloseAccountPasswordValues = z.infer<typeof closeAccountPasswordSchema>;

export const closeAccountConfirmSchema = z.object({
  confirmation: z.string().superRefine((val, ctx) => {
    if (val !== 'DELETE') {
      ctx.addIssue({ code: 'custom', message: i18n.t('settings.validation.confirmationRequired') });
    }
  }),
});
export type CloseAccountConfirmValues = z.infer<typeof closeAccountConfirmSchema>;
