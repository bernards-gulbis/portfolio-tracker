import * as z from 'zod';
import type { ParseKeys } from 'i18next';
import i18n from '../i18n/index';

// `.trim()` runs before validation so the parsed value has no surrounding
// whitespace — without it we'd validate the trimmed length but persist the
// untrimmed string.
export function nameField(requiredKey: ParseKeys, tooLongKey: ParseKeys) {
  return z.string().trim().superRefine((val, ctx) => {
    if (val.length < 1) {
      ctx.addIssue({ code: 'custom', message: i18n.t(requiredKey) });
    } else if (val.length > 255) {
      ctx.addIssue({ code: 'custom', message: i18n.t(tooLongKey) });
    }
  });
}

export const portfolioNameSchema = z.object({
  name: nameField('portfolio.validation.nameRequired', 'portfolio.validation.nameTooLong'),
});

export type PortfolioNameValues = z.infer<typeof portfolioNameSchema>;
