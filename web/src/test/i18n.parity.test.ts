import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en';
import lv from '../i18n/locales/lv';

/**
 * Translation parity gate.
 *
 * Walks both locale trees and flags any leaf string where the Latvian
 * value is identical to the English one. Most matches are bugs (someone
 * forgot to translate a key). A small set are intentional — currency
 * codes, brand names, sentinel values that must be typed verbatim — and
 * are explicitly whitelisted below. Adding a new entry to the whitelist
 * should be a deliberate review decision.
 */

// Allowed paths where lv === en is by design. Each entry must have a
// reason in the comment so reviewers can decide whether to keep it.
const WHITELIST = new Set<string>([
  'common.notAvailable',                       // 'N/A' — abbreviation reused as-is
  'common.daysShort',                          // 'd' — same single-letter abbreviation in LV
  'app.version',                               // 'v{{version}}' — pure interpolation token
  'app.footer.copyright',                      // proper name (author credit)
  'auth.fields.passwordPlaceholder',           // '••••••••' — bullet symbol
  'language.en',                               // 'English' — endonym in language picker
  'language.lv',                               // 'Latviski' — endonym in language picker
  'status.currency.usdLabel',                  // 'USD' — currency code
  'status.currency.eurLabel',                  // 'EUR' — currency code
  'chart.performance.sp500',                   // 'S&P 500 (%)' — index name
  'settings.account.confirmationPlaceholder',  // 'DELETE' — sentinel typed verbatim
]);

type Tree = Record<string, unknown>;

function* walk(tree: Tree, path: string[] = []): Generator<{ path: string; value: string }> {
  for (const [key, value] of Object.entries(tree)) {
    const next = [...path, key];
    if (typeof value === 'string') {
      yield { path: next.join('.'), value };
    } else if (value != null && typeof value === 'object') {
      yield* walk(value as Tree, next);
    }
  }
}

describe('i18n parity (en ↔ lv)', () => {
  it('every leaf is either translated or explicitly whitelisted', () => {
    const enLeaves = new Map<string, string>();
    for (const { path, value } of walk(en as unknown as Tree)) {
      enLeaves.set(path, value);
    }

    const collisions: string[] = [];
    const missingFromLv: string[] = [];
    for (const { path, value: lvValue } of walk(lv as unknown as Tree)) {
      const enValue = enLeaves.get(path);
      if (enValue == null) continue; // structural mismatch is the type system's problem
      if (enValue !== lvValue) continue;
      if (WHITELIST.has(path)) continue;
      collisions.push(`${path} = ${JSON.stringify(enValue)}`);
    }

    // Also flag any en path that's missing from lv entirely (Translation
    // type usually catches this, but a guard rail is cheap).
    const lvPaths = new Set<string>();
    for (const { path } of walk(lv as unknown as Tree)) lvPaths.add(path);
    for (const enPath of enLeaves.keys()) {
      if (!lvPaths.has(enPath)) missingFromLv.push(enPath);
    }

    expect(collisions, `Untranslated entries (lv === en):\n  ${collisions.join('\n  ')}`).toEqual([]);
    expect(missingFromLv, `Missing keys in lv:\n  ${missingFromLv.join('\n  ')}`).toEqual([]);
  });
});
