// The free tool pages in Hungarian and Spanish (/hu/tools/…, /es/tools/…).
// The widgets are the English pages' own; the copy comes from copy-hu.ts and
// copy-es.ts. pages.ts binds a language's copy; hu.tsx and es.tsx make one chunk per language.
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DebateTimer } from '@/components/free-tools/DebateTimer';
import { CustomFormatEditor } from '@/components/free-tools/CustomFormatEditor';
import { MotionGenerator } from '@/components/free-tools/MotionGenerator';
import { FlowSheet } from '@/components/free-tools/FlowSheet';
import { SpeechTimeCalculator } from '@/components/free-tools/SpeechTimeCalculator';
import { ToolCta, ToolFaq, ToolPageLayout, type FreeTool } from '@/components/free-tools/ToolPageLayout';
import { PRACTICE_MOTIONS } from '@/lib/free-tools/practice-motions';
import { captureProductEvent } from '@/lib/observability';
import { HEAD_NAMES } from '@/lib/seo/head-text';
import { isLocalizedRoute, localizedPath, useRouteLanguage } from '@/lib/seo/localized-routes';
import {
  hubStructuredData,
  TOOL_PAGE_HEAD_IDS,
  toolStructuredData,
  type ToolPageLocale,
  type ToolPageRoute,
  type ToolRoute,
} from '@/lib/seo/tool-pages';
import type { CopySection, LocalizedToolsCopy, ToolPageCopy } from './copy-types';

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

const fill = (text: string) => text.replaceAll('{product}', HEAD_NAMES.product).replaceAll('{total}', String(PRACTICE_MOTIONS.length));

/** Inline copy with its `[anchor](/route)` links: free tools in the page's language, other pages as written. */
function Inline({ text }: { text: string }) {
  const language = useRouteLanguage();
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, anchor, href] = match;
    parts.push(fill(text.slice(last, match.index)));
    if (isLocalizedRoute(href)) {
      parts.push(<Link key={match.index} to={localizedPath(href, language)}>{fill(anchor)}</Link>);
    } else if (href.startsWith('/')) {
      parts.push(<a key={match.index} href={href}>{fill(anchor)}</a>);
    } else {
      parts.push(<a key={match.index} href={href} rel="noopener" target="_blank">{fill(anchor)}</a>);
    }
    last = match.index + whole.length;
  }
  parts.push(fill(text.slice(last)));
  return <>{parts}</>;
}

function Section({ section }: { section: CopySection }) {
  return (
    <section>
      <h2>{fill(section.heading)}</h2>
      {section.paragraphs?.map((paragraph) => <p key={paragraph}><Inline text={paragraph} /></p>)}
      {section.steps && <ol>{section.steps.map((step) => <li key={step}><Inline text={step} /></li>)}</ol>}
      {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}><Inline text={bullet} /></li>)}</ul>}
      {section.subsections?.map((subsection) => (
        <Fragment key={subsection.heading}>
          <h3>{fill(subsection.heading)}</h3>
          {subsection.paragraphs.map((paragraph) => <p key={paragraph}><Inline text={paragraph} /></p>)}
        </Fragment>
      ))}
    </section>
  );
}

const SHORT_ANSWER_KEYS: Record<ToolRoute, string> = {
  '/tools': 'hub',
  '/tools/debate-timer': 'timer',
  '/tools/debate-motion-generator': 'motions',
  '/tools/debate-flow-sheet': 'flow',
  '/tools/speech-time-calculator': 'calc',
};

function widget(route: ToolPageRoute): ReactNode {
  switch (route) {
    case '/tools/debate-timer':
      return (
        <DebateTimer
          storageKey="debatelab-free-timer-v1"
          onFirstStart={(format) => captureProductEvent('free_tool_used', { freeTool: 'debate-timer', action: 'start', format })}
          footer={(session, setChoice) => <CustomFormatEditor key={session.choice.id} choice={session.choice} onApply={setChoice} />}
        />
      );
    case '/tools/debate-motion-generator':
      return <MotionGenerator />;
    case '/tools/debate-flow-sheet':
      return <FlowSheet />;
    case '/tools/speech-time-calculator':
      return <SpeechTimeCalculator />;
  }
}

function HubCards({ tools }: { tools: readonly FreeTool[] }) {
  const language = useRouteLanguage();
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {tools.map((tool) => (
        <li key={tool.route}>
          <Link
            to={localizedPath(tool.route, language)}
            className="flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <h2 className="text-lg font-semibold text-foreground">{tool.name}</h2>
            <p className="mt-1 text-muted-foreground">{tool.blurb}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function LocalizedToolPage({ route, copy, page }: { route: ToolRoute; copy: LocalizedToolsCopy; page: ToolPageCopy }) {
  const { t } = useTranslation();
  const language = useRouteLanguage();
  if (language === 'en') throw new Error(`${route} in English is the English page, not a translation`);
  const tools: FreeTool[] = (Object.keys(copy.tools) as ToolPageRoute[]).map((tool) => ({ route: tool, ...copy.tools[tool] }));
  const id = TOOL_PAGE_HEAD_IDS[route];
  const locale: ToolPageLocale = {
    language,
    title: t(`pageHead.${id}.title`, HEAD_NAMES),
    description: t(`pageHead.${id}.description`, HEAD_NAMES),
    hubName: t('tools:layout.allTools'),
    modified: copy.modified,
  };
  const faq = page.faq.map((entry) => ({ question: fill(entry.question), answer: fill(entry.answer) }));
  const key = SHORT_ANSWER_KEYS[route];
  const shortAnswer = { question: t(`tools:shortAnswer.${key}.question`), answer: t(`tools:shortAnswer.${key}.answer`, { total: PRACTICE_MOTIONS.length }) };
  const structuredData = route === '/tools'
    ? hubStructuredData(tools, locale)
    : toolStructuredData(route, copy.tools[route].name, [shortAnswer, ...faq], locale);

  return (
    <ToolPageLayout
      route={route}
      title={fill(page.title)}
      intro={<p><Inline text={page.intro} /></p>}
      shortAnswer={shortAnswer}
      structuredData={structuredData}
      tools={tools}
      tool={route === '/tools' ? <HubCards tools={tools} /> : widget(route)}
    >
      {page.sections.map((section) => <Section key={section.heading} section={section} />)}
      {faq.length > 0 && <ToolFaq faq={faq} />}
      <ToolCta title={fill(page.cta.title)}>
        <p><Inline text={page.cta.body} /></p>
      </ToolCta>
    </ToolPageLayout>
  );
}
