import { expect, it, vi } from 'vitest';

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'es' }] }));

it('resolves the initial language and a newly selected language synchronously, with English fallback', async () => {
  const { default: i18n, changeAppLanguage } = await import('./i18n');
  expect(i18n.language).toBe('es');
  expect(i18n.t('common.cancel')).toBe('Cancelar');
  expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
  expect(i18n.hasResourceBundle('hu', 'translation')).toBe(false);
  const changed = changeAppLanguage('hu');
  expect(i18n.t('common.cancel')).toBe('Mégse');
  expect(i18n.hasResourceBundle('hu', 'tools')).toBe(true);
  await changed;
  await changeAppLanguage('en');
  expect(i18n.t('common.cancel')).toBe('Cancel');
});
