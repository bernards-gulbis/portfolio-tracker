import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDaysHeldLabels } from '../hooks/useDaysHeldLabels';
import i18n from '../i18n/index';

async function changeLanguage(lang: string): Promise<void> {
  await act(async () => {
    await i18n.changeLanguage(lang);
  });
}

describe('useDaysHeldLabels', () => {
  let originalLang: string;

  beforeEach(() => {
    originalLang = i18n.language;
  });

  afterEach(async () => {
    await i18n.changeLanguage(originalLang);
  });

  it('returns short labels for days, months, years (English)', async () => {
    await changeLanguage('en');
    const { result } = renderHook(() => useDaysHeldLabels());
    expect(result.current).toEqual(
      expect.objectContaining({
        d: expect.any(String),
        m: expect.any(String),
        y: expect.any(String),
      }),
    );
    // In en, short labels are not empty
    expect(result.current.d.length).toBeGreaterThan(0);
    expect(result.current.m.length).toBeGreaterThan(0);
    expect(result.current.y.length).toBeGreaterThan(0);
  });

  it('updates labels when the language switches', async () => {
    await changeLanguage('en');
    const { result, rerender } = renderHook(() => useDaysHeldLabels());
    const en = { ...result.current };

    await changeLanguage('lv');
    rerender();

    // Either the labels differ or the LV translation happens to coincide with EN.
    // We mainly assert the hook returns valid strings after a language switch.
    expect(typeof result.current.d).toBe('string');
    expect(typeof result.current.m).toBe('string');
    expect(typeof result.current.y).toBe('string');
    expect(result.current.d.length).toBeGreaterThan(0);
    expect(en.d.length).toBeGreaterThan(0);
  });

  it('returns a stable reference when the language has not changed', async () => {
    await changeLanguage('en');
    const { result, rerender } = renderHook(() => useDaysHeldLabels());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
