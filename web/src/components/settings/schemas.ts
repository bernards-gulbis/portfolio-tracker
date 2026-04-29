import * as z from 'zod';
import i18n from '../../i18n/index';

export type SettingsSection = 'profile' | 'password' | 'tax' | 'account';

export const SECTIONS: SettingsSection[] = ['profile', 'password', 'tax', 'account'];

export const profileSchema = z.object({
  name: z.string().superRefine((val, ctx) => {
    if (val.trim().length < 1) {
      ctx.addIssue({ code: 'custom', message: i18n.t('settings.validation.nameRequired') });
    } else if (val.trim().length > 255) {
      ctx.addIssue({ code: 'custom', message: i18n.t('settings.validation.nameTooLong') });
    }
  }),
});
export type ProfileFormValues = z.infer<typeof profileSchema>;

export const passwordSchema = z
  .object({
    newPassword: z.string().superRefine((val, ctx) => {
      if (val.length < 8) {
        ctx.addIssue({ code: 'custom', message: i18n.t('settings.validation.passwordMinLength') });
      }
    }),
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
  password: z.string().superRefine((val, ctx) => {
    if (val.length < 1) {
      ctx.addIssue({ code: 'custom', message: i18n.t('settings.validation.passwordRequired') });
    }
  }),
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
