// Server entry for scripts/prerender.mjs, which loads it through Vite in Node
// after `vite build` and writes each page's HTML into dist/.
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthContext, type AuthContextValue } from '@/lib/supabase/auth-context';
import { BRAND, ORGANIZATION, PAGE_HEADS, PRODUCT, SITE_ORIGIN, type PageHead, type PrerenderedRoute } from '@/lib/seo/pages';
import LandingPage from '@/pages/LandingPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import NotFound from '@/pages/NotFound';

const unavailable = () => Promise.reject(new Error('Not available while prerendering'));

// Prerendered pages are what a signed-out visitor sees.
const SIGNED_OUT: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  signInWithGoogle: unavailable,
  signInWithEmailOtp: unavailable,
  verifyEmailOtp: unavailable,
  signInWithDemoCode: unavailable,
  signOut: unavailable,
  leaveEnvironment: unavailable,
  discardTabState: () => undefined,
};

export interface PrerenderedPage {
  route: PrerenderedRoute;
  /** Output path inside dist/. */
  file: string;
  /** Source path of the page module, the key of its chunk in the Vite manifest. */
  module: string;
  head: PageHead;
  body: string;
  structuredData?: object;
}

const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

/** "May 1, 2026" in the locale file, as 2026-05-01. */
function isoDate(englishDate: string): string {
  const time = Date.parse(`${englishDate} UTC`);
  if (Number.isNaN(time)) throw new Error(`Cannot read "${englishDate}" as a date`);
  return new Date(time).toISOString().slice(0, 10);
}

function webPage(route: PrerenderedRoute, dateModified: string | undefined) {
  const head: PageHead = PAGE_HEADS[route];
  return {
    '@type': 'WebPage',
    '@id': `${SITE_ORIGIN}${head.canonicalPath}#webpage`,
    url: `${SITE_ORIGIN}${head.canonicalPath}`,
    name: head.title,
    description: head.description,
    isPartOf: { '@id': WEBSITE_ID },
    ...(dateModified ? { dateModified } : {}),
  };
}

function landingStructuredData(dateModified: string | undefined) {
  const price = i18n.t('pricing.proPrice').replace(/[^\d.]/g, '');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: ORGANIZATION,
        url: `${SITE_ORIGIN}/`,
        logo: `${SITE_ORIGIN}/favicon.png`,
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: `${SITE_ORIGIN}/`,
        name: BRAND,
        publisher: { '@id': ORGANIZATION_ID },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_ORIGIN}/#software`,
        name: BRAND,
        alternateName: PRODUCT,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        url: `${SITE_ORIGIN}/`,
        image: `${SITE_ORIGIN}/hero-visual.png`,
        description: PAGE_HEADS['/'].description,
        offers: { '@type': 'Offer', price, priceCurrency: 'USD' },
        publisher: { '@id': ORGANIZATION_ID },
      },
      webPage('/', dateModified),
    ],
  };
}

function legalStructuredData(route: '/terms' | '/privacy', dateKey: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [webPage(route, isoDate(i18n.t(dateKey, { lng: 'en' })))],
  };
}

function render(route: PrerenderedRoute, Page: ComponentType): string {
  return renderToString(
    <AuthContext.Provider value={SIGNED_OUT}>
      <TooltipProvider delayDuration={200}>
        <StaticRouter location={route === '*' ? '/404' : route}>
          <Page />
        </StaticRouter>
      </TooltipProvider>
    </AuthContext.Provider>,
  );
}

/**
 * Renders the public pages in English, signed out. `landingModified` is the
 * date the landing page's source last changed, when the build can tell.
 */
export async function prerenderPages({ landingModified }: { landingModified?: string }): Promise<PrerenderedPage[]> {
  await i18n.changeLanguage('en');
  return [
    {
      route: '/',
      file: 'index.html',
      module: 'src/pages/LandingPage.tsx',
      head: PAGE_HEADS['/'],
      body: render('/', LandingPage),
      structuredData: landingStructuredData(landingModified),
    },
    {
      route: '/terms',
      file: 'terms/index.html',
      module: 'src/pages/TermsPage.tsx',
      head: PAGE_HEADS['/terms'],
      body: render('/terms', TermsPage),
      structuredData: legalStructuredData('/terms', 'termsPage.date'),
    },
    {
      route: '/privacy',
      file: 'privacy/index.html',
      module: 'src/pages/PrivacyPage.tsx',
      head: PAGE_HEADS['/privacy'],
      body: render('/privacy', PrivacyPage),
      structuredData: legalStructuredData('/privacy', 'privacyPage.date'),
    },
    {
      route: '*',
      file: '404.html',
      module: 'src/pages/NotFound.tsx',
      head: PAGE_HEADS['*'],
      body: render('*', NotFound),
    },
  ];
}
