// Server entry for scripts/prerender.mjs, which loads it through Vite in Node
// after `vite build` and writes each page's HTML into dist/.
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import i18n, { applyAppLanguage } from '@/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthContext, type AuthContextValue } from '@/lib/supabase/auth-context';
import site from '@/config/site.json';
import { FREE_PLAN } from '@/lib/seo/site-text';
import { SOFTWARE_DESCRIPTION, ORGANIZATION_ID, PAGE_HEAD_IDS, PAGE_HEADS, PRICING, PRODUCT, SITE_ORIGIN, factsAsOf, organizationNode, type PageHead, type PrerenderedRoute } from '@/lib/seo/pages';
import { HEAD_NAMES } from '@/lib/seo/head-text';
import { hreflangAlternates, isLocalizedRoute, LOCALIZED_PATHS, RouteLanguageProvider, type PageLanguage } from '@/lib/seo/localized-routes';
import { TOOL_PAGES as HU_TOOL_PAGES } from '@/pages/tools/localized/hu';
import { TOOL_PAGES as ES_TOOL_PAGES } from '@/pages/tools/localized/es';
import LandingPage from '@/pages/LandingPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import AboutPage from '@/pages/AboutPage';
import ContactPage from '@/pages/ContactPage';
import NotFound from '@/pages/NotFound';
import SourcesPage from '@/pages/SourcesPage';
import { PRACTICE_TOOLS, PREPARE_TOOLS, PREP_MODE_COUNT, UTILITY_TOOLS } from '@/components/features/tools/tool-links';
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
  /** The address, which #root's data-prerendered names: /hu for the Hungarian landing page. */
  route: string;
  /** The <html lang>; English when absent. */
  language?: PageLanguage;
  /** hreflang links for a page that exists in every language. */
  alternates?: { hreflang: string; href: string }[];
  /** Output path inside dist/. */
  file: string;
  /** Source path of the page module, the key of its chunk in the Vite manifest. */
  module: string;
  head: PageHead;
  body: string;
  structuredData?: object;
}

const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

/** "May 1, 2026" in the locale file, as 2026-05-01. */
function isoDate(englishDate: string): string {
  const time = Date.parse(`${englishDate} UTC`);
  if (Number.isNaN(time)) throw new Error(`Cannot read "${englishDate}" as a date`);
  return new Date(time).toISOString().slice(0, 10);
}

function webPage(route: PrerenderedRoute, dateModified: string | undefined, head: PageHead = PAGE_HEADS[route], language?: PageLanguage) {
  return {
    '@type': 'WebPage',
    '@id': `${SITE_ORIGIN}${head.canonicalPath}#webpage`,
    url: `${SITE_ORIGIN}${head.canonicalPath}`,
    name: head.title,
    description: head.description,
    ...(language ? { inLanguage: language } : {}),
    isPartOf: { '@id': WEBSITE_ID },
    ...(dateModified ? { dateModified } : {}),
  };
}

/** The landing page's visible questions and answers, in the order the page shows them, in i18n's current language. */
function landingQuestions(language: PageLanguage = 'en'): Array<[string, string]> {
  const asOf = factsAsOf(language);
  return [
    [i18n.t('shortAnswer.question'), i18n.t('shortAnswer.answer', { asOf })],
    [i18n.t('faq.q6'), i18n.t('faq.a6', { modes: PREP_MODE_COUNT })],
    [i18n.t('faq.q8'), i18n.t('faq.a8')],
    [i18n.t('faq.q7'), i18n.t('faq.a7', { asOf })],
    [i18n.t('faq.q1'), i18n.t('faq.a1', { asOf })],
    [i18n.t('faq.q9'), i18n.t('faq.a9')],
    ...[2, 3, 4, 5].map((n): [string, string] => [i18n.t(`faq.q${n}`), i18n.t(`faq.a${n}`)]),
  ];
}

const APP_TOOLS = [...PREPARE_TOOLS, ...PRACTICE_TOOLS, ...UTILITY_TOOLS];
// Word, PDF and Google Docs exports lay a case out in the same sections the app shows.
const EXPORT_FEATURE = 'Google Docs and PDF export in the case format';

function landingStructuredData(dateModified: string | undefined) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: `${SITE_ORIGIN}/`,
        name: PRODUCT,
        // A real alternate spelling, not the name again.
        alternateName: [site.alternateName, new URL(SITE_ORIGIN).host],
        inLanguage: ['en', 'hu', 'es'],
        publisher: { '@id': ORGANIZATION_ID },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_ORIGIN}/#software`,
        name: PRODUCT,
        alternateName: site.alternateName,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        url: `${SITE_ORIGIN}/`,
        image: `${SITE_ORIGIN}/hero-visual.jpg?v=2`,
        description: SOFTWARE_DESCRIPTION,
        inLanguage: ['en', 'es', 'hu'],
        featureList: [...APP_TOOLS.map((tool) => i18n.t(`features.${tool.key}`)), EXPORT_FEATURE],
        offers: [
          {
            '@type': 'Offer',
            name: 'Free trial',
            price: '0',
            priceCurrency: PRICING.currency,
            description: `${PRICING.trialDays}-day free trial, no credit card required. ${FREE_PLAN}`,
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
      faqPage('en'),
    ],
  };
}

function faqPage(language: PageLanguage) {
  return {
    '@type': 'FAQPage',
    mainEntity: landingQuestions(language).map(([name, text]) => ({
      '@type': 'Question',
      name,
      acceptedAnswer: { '@type': 'Answer', text },
    })),
  };
}

/** /hu and /es: their own page and FAQ, about the product the English landing page describes. */
function localizedLandingStructuredData(head: PageHead, language: PageLanguage, dateModified: string | undefined) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { ...webPage('/', dateModified, head, language), about: { '@id': `${SITE_ORIGIN}/#software` } },
      faqPage(language),
    ],
  };
}

/** Home, then the page: the trail the guides and tool pages already carry. */
function breadcrumbList(route: '/terms' | '/privacy' | '/about' | '/contact' | '/expocit/sources', name: string) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: PRODUCT, item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name, item: `${SITE_ORIGIN}${route}` },
    ],
  };
}

function legalStructuredData(route: '/terms' | '/privacy', page: 'termsPage' | 'privacyPage') {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      webPage(route, isoDate(i18n.t(`${page}.date`, { lng: 'en' }))),
      breadcrumbList(route, i18n.t(`${page}.title`, { lng: 'en' })),
    ],
  };
}

// The day the About and Contact copy last changed; move it when their text does.
const ABOUT_CONTACT_MODIFIED = '2026-10-28';

/** /about as an AboutPage about the Organization the home page defines; /contact as a ContactPage. */
function aboutContactStructuredData(route: '/about' | '/contact') {
  const about = route === '/about';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { ...webPage(route, ABOUT_CONTACT_MODIFIED), '@type': about ? 'AboutPage' : 'ContactPage', about: { '@id': ORGANIZATION_ID } },
      breadcrumbList(route, i18n.t(about ? 'footer.about' : 'footer.contact', { lng: 'en' })),
    ],
  };
}

function render(route: string, Page: ComponentType, language: PageLanguage = 'en'): string {
  return renderToString(
    <AuthContext.Provider value={SIGNED_OUT}>
      <TooltipProvider delayDuration={200}>
        <StaticRouter location={route === '*' ? '/404' : route}>
          <RouteLanguageProvider value={language}>
            <Page />
          </RouteLanguageProvider>
        </StaticRouter>
      </TooltipProvider>
    </AuthContext.Provider>,
  );
}

const TRANSLATED_TOOL_PAGES = { hu: HU_TOOL_PAGES, es: ES_TOOL_PAGES };

/** The Hungarian and Spanish pages: the landing page and the free tools, each in its own language. */
async function localizedPages(landingModified: string | undefined): Promise<PrerenderedPage[]> {
  const pages: PrerenderedPage[] = [];
  for (const { path, route, language } of LOCALIZED_PATHS) {
    await applyAppLanguage(language);
    const id = PAGE_HEAD_IDS[route];
    const head: PageHead = {
      title: i18n.t(`pageHead.${id}.title`, HEAD_NAMES),
      description: i18n.t(`pageHead.${id}.description`, HEAD_NAMES),
      canonicalPath: path,
    };
    const common = { route: path, file: `${path.slice(1)}/index.html`, language, alternates: hreflangAlternates(route), head };
    if (route === '/') {
      pages.push({
        ...common,
        module: 'src/pages/LandingPage.tsx',
        body: render(path, LandingPage, language),
        structuredData: localizedLandingStructuredData(head, language, landingModified),
      });
    } else {
      // The tool pages render their own JSON-LD in the body.
      pages.push({ ...common, module: `src/pages/tools/localized/${language}.tsx`, body: render(path, TRANSLATED_TOOL_PAGES[language][route], language) });
    }
  }
  await applyAppLanguage('en');
  return pages;
}

const alternatesOf = (route: string) => (isLocalizedRoute(route) ? { alternates: hreflangAlternates(route) } : {});

/**
 * Renders the public pages in English, signed out. `landingModified` is the
 * date the landing page's source last changed, when the build can tell.
 */
export async function prerenderPages({ landingModified }: { landingModified?: string }): Promise<PrerenderedPage[]> {
  await i18n.changeLanguage('en');
  return [
    {
      ...alternatesOf('/'),
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
      structuredData: legalStructuredData('/terms', 'termsPage'),
    },
    {
      route: '/privacy',
      file: 'privacy/index.html',
      module: 'src/pages/PrivacyPage.tsx',
      head: PAGE_HEADS['/privacy'],
      body: render('/privacy', PrivacyPage),
      structuredData: legalStructuredData('/privacy', 'privacyPage'),
    },
    ...(['/about', '/contact'] as const).map((route) => ({
      route,
      file: `${route.slice(1)}/index.html`,
      module: route === '/about' ? 'src/pages/AboutPage.tsx' : 'src/pages/ContactPage.tsx',
      head: PAGE_HEADS[route],
      body: render(route, route === '/about' ? AboutPage : ContactPage),
      structuredData: aboutContactStructuredData(route),
    })),
    // The tool pages render their own JSON-LD in the body.
    ...TOOL_PAGES.map(({ route, module, Page }) => ({
      ...alternatesOf(route),
      route,
      file: `${route.slice(1)}/index.html`,
      module,
      head: PAGE_HEADS[route],
      body: render(route, Page),
    })),
    {
      route: '/expocit/sources',
      file: 'expocit/sources/index.html',
      module: 'src/pages/SourcesPage.tsx',
      head: PAGE_HEADS['/expocit/sources'],
      body: render('/expocit/sources', SourcesPage),
      structuredData: {
        '@context': 'https://schema.org',
        '@graph': [webPage('/expocit/sources', undefined), breadcrumbList('/expocit/sources', i18n.t('sourcesPage.title'))],
      },
    },
    {
      route: '*',
      file: '404.html',
      module: 'src/pages/NotFound.tsx',
      head: PAGE_HEADS['*'],
      body: render('*', NotFound),
    },
    // Last: they switch i18n to each language in turn, then back to English.
    ...(await localizedPages(landingModified)),
  ];
}
