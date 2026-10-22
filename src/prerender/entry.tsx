// Server entry for scripts/prerender.mjs, which loads it through Vite in Node
// after `vite build` and writes each page's HTML into dist/.
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthContext, type AuthContextValue } from '@/lib/supabase/auth-context';
import { BRAND, DEFINITION, ORGANIZATION, PAGE_HEADS, PRICING, PRODUCT, SITE_ORIGIN, factsAsOf, type PageHead, type PrerenderedRoute } from '@/lib/seo/pages';
import LandingPage from '@/pages/LandingPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import NotFound from '@/pages/NotFound';
import { TOOL_PAGES } from './tool-pages';

const unavailable = () => Promise.reject(new Error('Not available while prerendering'));

// Prerendered pages are what a signed-out visitor sees.
const SIGNED_OUT: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  callbackError: null,
  clearCallbackError: () => undefined,
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

/** The landing page's visible questions and answers, in the order the page shows them. */
function landingQuestions(): Array<[string, string]> {
  const asOf = factsAsOf('en');
  return [
    [i18n.t('shortAnswer.question'), i18n.t('shortAnswer.answer', { asOf })],
    [i18n.t('faq.q6'), i18n.t('faq.a6')],
    [i18n.t('faq.q1'), i18n.t('faq.a1', { asOf })],
    ...[2, 3, 4, 5].map((n): [string, string] => [i18n.t(`faq.q${n}`), i18n.t(`faq.a${n}`)]),
  ];
}

const PREP_MODES = ['generate', 'attack', 'brainstorm', 'factoids', 'ask', 'crossfire', 'sparring', 'library', 'timer', 'flowchart', 'history'];

function landingStructuredData(dateModified: string | undefined) {
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
        description: DEFINITION,
        inLanguage: ['en', 'es', 'hu'],
        featureList: PREP_MODES.map((mode) => i18n.t(`features.${mode}`)),
        offers: [
          {
            '@type': 'Offer',
            name: 'Free trial',
            price: '0',
            priceCurrency: PRICING.currency,
            description: `${PRICING.trialDays}-day free trial, no credit card required.`,
          },
          {
            '@type': 'Offer',
            name: 'Pro',
            price: PRICING.proMonthly,
            priceCurrency: PRICING.currency,
            description: 'Monthly subscription, billed plus tax.',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: PRICING.proMonthly,
              priceCurrency: PRICING.currency,
              billingDuration: 'P1M',
              valueAddedTaxIncluded: false,
            },
          },
        ],
        publisher: { '@id': ORGANIZATION_ID },
      },
      webPage('/', dateModified),
      {
        '@type': 'FAQPage',
        mainEntity: landingQuestions().map(([name, text]) => ({
          '@type': 'Question',
          name,
          acceptedAnswer: { '@type': 'Answer', text },
        })),
      },
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
    // The tool pages render their own JSON-LD in the body.
    ...TOOL_PAGES.map(({ route, module, Page }) => ({
      route,
      file: `${route.slice(1)}/index.html`,
      module,
      head: PAGE_HEADS[route],
      body: render(route, Page),
    })),
    {
      route: '*',
      file: '404.html',
      module: 'src/pages/NotFound.tsx',
      head: PAGE_HEADS['*'],
      body: render('*', NotFound),
    },
  ];
}
