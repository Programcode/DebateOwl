import { act, render } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAppLanguage } from '@/i18n';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import hu from '@/locales/hu.json';
import { HEAD_NAMES } from '@/lib/seo/head-text';
import { PAGE_HEADS, SITE_ORIGIN as PAGE_ORIGIN, type PrerenderedRoute } from '@/lib/seo/pages';
import { usePageHead, usePrivateRouteHead } from '@/lib/seo/use-page-head';
import { RouteLanguageProvider } from '@/lib/seo/localized-routes';

// IN-01, SE-01: every page's tab title and description follow the interface language.

function PublicPage({ route }: { route: PrerenderedRoute }): null {
  usePageHead(route);
  return null;
}

function GeneratePage(): null {
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
    expect(document.title).toBe('Felhasználási feltételek | DebateOwl by Pi-Stack');
    await switchTo('es');
    expect(document.title).toBe('Términos del servicio | DebateOwl by Pi-Stack');
  });

  it('translate the 404 page and keep it out of the index', async () => {
    render(<PublicPage route="*" />);
    await switchTo('es');
    expect(document.title).toBe('Página no encontrada | DebateOwl by Pi-Stack');
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex, nofollow');
  });

  it('name each app page and DebateOwl, in the interface language', async () => {
    render(<GeneratePage />);
    expect(document.title).toBe('Generate · DebateOwl');
    expect(description()).toBe(PAGE_HEADS['/'].description);

    await switchTo('hu');
    expect(document.title).toBe(`${hu.nav.generate} · DebateOwl`);
    expect(description()).toBe(hu.pageHead.home.description.replace('{{product}}', HEAD_NAMES.product));
  });

  it('keep a Hungarian or Spanish page canonical to its own address, not the English one', () => {
    // The prerendered /hu says canonical /hu; if the app rewrote it to / on load, Google would fold /hu into the English page.
    const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
    const { unmount } = render(<RouteLanguageProvider value="hu"><PublicPage route="/" /></RouteLanguageProvider>);
    expect(canonical()).toBe(`${PAGE_ORIGIN}/hu`);
    unmount();
    render(<RouteLanguageProvider value="es"><PublicPage route="/tools/debate-timer" /></RouteLanguageProvider>);
    expect(canonical()).toBe(`${PAGE_ORIGIN}/es/tools/cronometro-debate`);
  });

  it('keep every description within 160 characters in every language', () => {
    const fill = (text: string) => text.replace('{{brand}}', HEAD_NAMES.brand).replace('{{product}}', HEAD_NAMES.product);
    const tooLong = [en, es, hu].flatMap((catalog) => Object.entries(catalog.pageHead)
      .filter(([, head]) => fill(head.description).length > 160)
      .map(([id, head]) => `${id}: ${fill(head.description).length}`));
    expect(tooLong).toEqual([]);
  });
});
