import * as z from 'zod';
import i18n from '../i18n/index';

export const portfolioNameSchema = z.object({
  name: z.string().superRefine((val, ctx) => {
    const trimmed = val.trim();
    if (trimmed.length < 1) {
      ctx.addIssue({ code: 'custom', message: i18n.t('portfolio.validation.nameRequired') });
    } else if (trimmed.length > 255) {
      ctx.addIssue({ code: 'custom', message: i18n.t('portfolio.validation.nameTooLong') });
    }
  }),
});

export type PortfolioNameValues = z.infer<typeof portfolioNameSchema>;
