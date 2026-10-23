import { act, render } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAppLanguage } from '@/i18n';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import hu from '@/locales/hu.json';
import { HEAD_NAMES } from '@/lib/seo/head-text';
import { PAGE_HEADS, type PrerenderedRoute } from '@/lib/seo/pages';
import { usePageHead, usePrivateRouteHead } from '@/lib/seo/use-page-head';

// IN-01, SE-01: every page's tab title and description follow the interface language.

function PublicPage({ route }: { route: PrerenderedRoute }) {
  usePageHead(route);
  return null;
}

function GeneratePage() {
  const { t } = useTranslation();
  usePrivateRouteHead('/app/generate', t('nav.generate'));
  return null;
}

const description = () => document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content;

async function switchTo(language: 'en' | 'es' | 'hu') {
  await act(() => applyAppLanguage(language));
}

describe('page titles', () => {
  afterEach(() => switchTo('en'));

  it('match the prerendered English head, then follow a language switch', async () => {
    render(<PublicPage route="/terms" />);
    expect(document.title).toBe(PAGE_HEADS['/terms'].title);
    expect(description()).toBe(PAGE_HEADS['/terms'].description);

    await switchTo('hu');
    expect(document.title).toBe('Felhasználási feltételek | DebateLab by Pi-Stack');
    await switchTo('es');
    expect(document.title).toBe('Términos del servicio | DebateLab by Pi-Stack');
  });

  it('translate the 404 page and keep it out of the index', async () => {
    render(<PublicPage route="*" />);
    await switchTo('es');
    expect(document.title).toBe('Página no encontrada | DebateLab by Pi-Stack');
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex, nofollow');
  });

  it('name each app page and DebateLab, in the interface language', async () => {
    render(<GeneratePage />);
    expect(document.title).toBe('Generate · DebateLab');
    expect(description()).toBe(PAGE_HEADS['/'].description);

    await switchTo('hu');
    expect(document.title).toBe(`${hu.nav.generate} · DebateLab`);
    expect(description()).toBe(hu.pageHead.home.description.replace('{{product}}', HEAD_NAMES.product));
  });

  it('keep every description within 160 characters in every language', () => {
    const fill = (text: string) => text.replace('{{brand}}', HEAD_NAMES.brand).replace('{{product}}', HEAD_NAMES.product);
    const tooLong = [en, es, hu].flatMap((catalog) => Object.entries(catalog.pageHead)
      .filter(([, head]) => fill(head.description).length > 160)
      .map(([id, head]) => `${id}: ${fill(head.description).length}`));
    expect(tooLong).toEqual([]);
  });
});
