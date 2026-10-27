import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { OwlMark } from '@/components/brand/Owl';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Footer from '@/components/landing/Footer';
import { usePageHead } from '@/lib/seo/use-page-head';
import { jsonLd, type FaqEntry, type ToolPageRoute, type ToolRoute } from '@/lib/seo/tool-pages';
import { localizedPath, useRouteLanguage } from '@/lib/seo/localized-routes';
import site from '@/config/site.json';
import { cn } from '@/lib/utils';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/SkipLink';

export const FREE_TOOLS = [
  { route: '/tools/debate-timer', name: 'Debate timer', blurb: 'Round timer for PF, LD, Policy, BP, World Schools and Asian Parliamentary, with protected time, POI knocks and prep banks.' },
  { route: '/tools/debate-motion-generator', name: 'Debate motion generator', blurb: 'Draw one practice motion or three for a veto drill, from 300 original motions sorted by topic and difficulty.' },
  { route: '/tools/debate-flow-sheet', name: 'Debate flow sheet', blurb: 'A printable one-page flow with a column for every speech in your format, on A4 or Letter.' },
  { route: '/tools/speech-time-calculator', name: 'Speech time calculator', blurb: 'Paste a speech to see how long it takes to deliver and which speech slots it fits.' },
] as const;

/** A free tool's English route, with its name and blurb in the page's language. */
export type FreeTool = { route: ToolPageRoute; name: string; blurb: string };

/** Long-form copy under a tool: a readable measure and plain headings. */
export function ToolArticle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto max-w-[68ch] space-y-10 text-base leading-7 text-foreground [&_a:not(.not-prose)]:py-1 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:text-lg [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6', className)}>
      {children}
    </div>
  );
}

export function ToolFaq({ faq }: { faq: readonly FaqEntry[] }) {
  const { t } = useTranslation('tools');
  return (
    <section aria-labelledby="faq-heading">
      <h2 id="faq-heading">{t('layout.faq')}</h2>
      {/* Native disclosure: every answer is in the HTML, open or not. */}
      <div className="mt-4 divide-y divide-border border-y border-border">
        {faq.map((entry) => (
          <details key={entry.question} className="group py-3">
            <summary className="cursor-pointer list-none font-medium marker:hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm [&::-webkit-details-marker]:hidden">
              <span className="mr-2 inline-block text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true">›</span>
              {entry.question}
            </summary>
            <p className="mt-2! pl-5 text-muted-foreground">{entry.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** The one call to action on a tool page. Pricing facts only: 3-day trial, no card, then $5 a month. */
export function ToolCta({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation('tools');
  return (
    <aside className="rounded-xl border-2 border-brand-tint-border bg-brand-tint p-6" aria-labelledby="cta-heading">
      <h2 id="cta-heading" className="text-xl!">{title}</h2>
      <div className="mt-2! text-muted-foreground">{children}</div>
      <p className="mt-2! text-sm text-muted-foreground">{t('layout.ctaPricing')}</p>
      <Link to="/login" className={cn(buttonVariants(), 'not-prose mt-4! no-underline!')}>
        {t('layout.ctaButton')}
      </Link>
    </aside>
  );
}

function OtherTools({ current, tools }: { current: ToolRoute; tools: readonly FreeTool[] }) {
  const { t } = useTranslation('tools');
  const language = useRouteLanguage();
  const others = tools.filter((tool) => tool.route !== current);
  if (others.length === tools.length) return null;
  return (
    <nav aria-labelledby="other-tools-heading">
      <h2 id="other-tools-heading">{t('layout.otherTools')}</h2>
      <ul className="list-none! pl-0! mt-4 grid gap-4 sm:grid-cols-3">
        {others.map((tool) => (
          <li key={tool.route} className="mt-0!">
            <Link to={localizedPath(tool.route, language)} className="font-medium">{tool.name}</Link>
            <p className="mt-1! text-sm text-muted-foreground">{tool.blurb}</p>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface ToolPageLayoutProps {
  route: ToolRoute;
  /** The visible h1. */
  title: string;
  intro: ReactNode;
  /** The reader's question and a direct answer: the first H2, which answer engines quote. */
  shortAnswer: FaqEntry;
  /** The working tool, shown right under the intro. */
  tool?: ReactNode;
  /** Long-form sections, FAQ and CTA. */
  children: ReactNode;
  structuredData: object;
  /** The tools' names and blurbs in the page's language; English by default. */
  tools?: readonly FreeTool[];
}

export function ToolPageLayout({ route, title, intro, shortAnswer, tool, children, structuredData, tools = FREE_TOOLS }: ToolPageLayoutProps) {
  const { t } = useTranslation('tools');
  usePageHead(route);
  const language = useRouteLanguage();
  const home = localizedPath('/', language);
  const hub = localizedPath('/tools', language);
  const crumb = tools.find((entry) => entry.route === route)?.name;

  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <header className="border-b border-border/60 print:hidden">
        <div className="container flex h-14 items-center justify-between gap-4 px-4">
          <Link to={home} className="flex items-center gap-2 rounded-md pointer-coarse:min-h-11">
            <OwlMark size={32} />
            <span className="font-display text-lg font-[600] tracking-[-0.01em] text-heading">{site.product}</span>
          </Link>
          <Link to={hub} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
            {t('layout.allTools')}
          </Link>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} className="container mx-auto px-4 pb-16 pt-6 focus-visible:outline-hidden">
        <nav aria-label={t('layout.breadcrumb')} className="text-sm text-muted-foreground print:hidden">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link to={home} className="inline-flex min-h-6 items-center hover:text-foreground pointer-coarse:min-h-11">{site.product}</Link></li>
            <li aria-hidden="true">/</li>
            {crumb ? (
              <>
                <li><Link to={hub} className="inline-flex min-h-6 items-center hover:text-foreground pointer-coarse:min-h-11">{t('layout.allTools')}</Link></li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-foreground">{crumb}</li>
              </>
            ) : (
              <li aria-current="page" className="text-foreground">{t('layout.allTools')}</li>
            )}
          </ol>
        </nav>
        <div className="mx-auto mt-6 max-w-[68ch] print:hidden">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
          <div className="mt-3 text-lg leading-8 text-muted-foreground [&_a]:py-1">{intro}</div>
          {/* Before the tool: the timer, calculator and hub cards carry H2s of their own. */}
          <section aria-labelledby="short-answer" className="mt-8">
            <h2 id="short-answer" className="text-xl font-semibold tracking-tight text-foreground">{shortAnswer.question}</h2>
            <p className="mt-2 leading-7 text-foreground">{shortAnswer.answer}</p>
          </section>
        </div>
        {tool && <div className="mx-auto mt-8 max-w-5xl">{tool}</div>}
        <ToolArticle className="mt-14 print:hidden">
          {children}
          <OtherTools current={route} tools={tools} />
        </ToolArticle>
      </main>
      <div className="print:hidden"><Footer /></div>
      {/* In the body, so the dev server and the prerendered HTML carry the same JSON-LD. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
    </div>
  );
}
