import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocale } from '../hooks/useLocale';
import i18n from '../i18n/index';

async function changeLanguage(lang: string): Promise<void> {
  await act(async () => {
    await i18n.changeLanguage(lang);
  });
}

describe('useLocale', () => {
  let originalLang: string;

  beforeEach(() => {
    originalLang = i18n.language;
  });

  afterEach(async () => {
    await i18n.changeLanguage(originalLang);
  });

  it('returns en-US for English language', async () => {
    await changeLanguage('en');
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBe('en-US');
  });

  it('returns lv-LV for Latvian language', async () => {
    await changeLanguage('lv');
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBe('lv-LV');
  });

  it('strips region tags before lookup', async () => {
    await changeLanguage('en-GB');
    const { result } = renderHook(() => useLocale());
    // 'en-GB' should map to 'en-US' (the canonical EN locale in this app)
    expect(result.current).toBe('en-US');
  });

  it('falls back to en-US for unknown languages', async () => {
    await changeLanguage('xx');
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBe('en-US');
  });
});
