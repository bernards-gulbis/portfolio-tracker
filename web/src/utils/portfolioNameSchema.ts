import * as z from 'zod';
import i18n from '../i18n/index';

export const portfolioNameSchema = z.object({
  // ``.trim()`` runs before ``.superRefine()`` so the parsed/submitted value
  // has no surrounding whitespace; previously we only validated the trimmed
  // length but persisted the untrimmed string.
  name: z.string().trim().superRefine((val, ctx) => {
    if (val.length < 1) {
      ctx.addIssue({ code: 'custom', message: i18n.t('portfolio.validation.nameRequired') });
    } else if (val.length > 255) {
      ctx.addIssue({ code: 'custom', message: i18n.t('portfolio.validation.nameTooLong') });
    }
  }),
});

export type PortfolioNameValues = z.infer<typeof portfolioNameSchema>;
