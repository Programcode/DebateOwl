import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { OwlMark } from '@/components/brand/Owl';
import Footer from '@/components/landing/Footer';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/SkipLink';
import { ToolArticle, ToolFaq } from '@/components/free-tools/ToolPageLayout';
import { MiniRound, TrialCta } from '@/components/ai-debate/MiniRound';
import site from '@/config/site.json';
import { ORGANIZATION_ID, PAGE_HEADS, PRICING, SITE_ORIGIN } from '@/lib/seo/pages';
import { jsonLd, type FaqEntry } from '@/lib/seo/tool-pages';
import { usePageHead } from '@/lib/seo/use-page-head';
import { readPrerenderedData } from '@/lib/seo/prerendered-data';
import { listPublishedRounds, publishedRoundPath, sideLabel, type PublishedRound } from '@/lib/published-rounds';

const ROUTE = '/ai-debate';
const URL = `${SITE_ORIGIN}${ROUTE}`;
const NAME = 'AI debate partner';
// The day this page's copy last changed; move it when the text does.
const MODIFIED = '2026-11-05';

const SHORT_ANSWER: FaqEntry = {
  question: 'What is an AI debate partner?',
  answer: `An AI debate partner takes the side you are not on and answers your arguments the way an opponent would, so you can practice clash without a second person. On this page it gives one rebuttal and a one-line judge note, and you get one reply. In the full ${site.product} app it runs whole timed rounds and scores them.`,
};

const FAQ: FaqEntry[] = [
  {
    question: 'Is there an AI for debate?',
    answer: `Yes. Any chatbot will argue a side if asked, but ${site.product} is made for debate prep: it turns a motion into a case with "If they say… we answer…" replies and drills you with AI rebuttals, cross-examination and timed rounds. Try one exchange above, free and without an account; the full app costs $${PRICING.proMonthly}/month plus tax after a ${PRICING.trialDays}-day trial.`,
  },
  {
    question: 'Is it free?',
    answer: `The mini round on this page is free: one argument, one AI rebuttal with a judge note, and one follow-up, up to three rounds a day per network. The ${site.product} app is not free. It starts with a ${PRICING.trialDays}-day free trial with no credit card, then costs $${PRICING.proMonthly}/month plus tax. There is no free plan.`,
  },
  {
    question: 'Do I need an account?',
    answer: 'Not for the mini round. You pass a quick bot check and start typing. For full timed rounds, saved history and the other practice modes you sign in with Google or an email code, which starts the trial.',
  },
  {
    question: 'Can I share my round?',
    answer: 'Only if you choose to. A finished mini round stays private unless you tick the publish box and press Publish; then it gets its own page that anyone with the link can read. Email addresses, phone numbers, links, handles and introduced names are removed first, and short rounds or rounds with something removed are kept out of search results. You can unpublish it from the same browser.',
  },
  {
    question: 'Which debate formats does it support?',
    answer: 'Sparring, the full-round mode, runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds, with the speech order and time limits of each. The mini round on this page has no format: it is one argument and one rebuttal.',
  },
  {
    question: 'Can it judge me?',
    answer: 'Yes. Here the judge note names the weakest link in your argument. A full Sparring round ends with a scorecard: Logic, Evidence, Delivery and Strategy, each scored out of 25, with key moments from the transcript, areas to improve and a verdict.',
  },
  {
    question: 'Which languages does it work in?',
    answer: `${site.product} works in English, Spanish and Hungarian. The mini round answers in the language you write your argument in.`,
  },
];

function structuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${URL}#app`,
        name: `${site.product} ${NAME}`,
        url: URL,
        description: PAGE_HEADS[ROUTE].description,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any (web browser)',
        offers: {
          '@type': 'Offer',
          price: PRICING.proMonthly,
          priceCurrency: PRICING.currency,
          description: `Pro, billed monthly plus tax. New accounts get a ${PRICING.trialDays}-day free trial first, no credit card required. The mini round on this page needs no account.`,
        },
        publisher: { '@id': ORGANIZATION_ID },
        dateModified: MODIFIED,
      },
      {
        '@type': 'WebPage',
        '@id': `${URL}#webpage`,
        url: URL,
        name: PAGE_HEADS[ROUTE].title,
        description: PAGE_HEADS[ROUTE].description,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        dateModified: MODIFIED,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: site.brand, item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: NAME, item: URL },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${URL}#faq`,
        mainEntity: [SHORT_ANSWER, ...FAQ].map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer },
        })),
      },
    ],
  };
}

/** How many published rounds the page links to; the build embeds them (src/prerender/entry.tsx). */
export const RECENT_ROUNDS = 12;

export interface AiDebatePageData {
  route: typeof ROUTE;
  recentRounds: PublishedRound[];
}

/** The newest indexable published rounds: from the build when this page was prerendered, otherwise fetched. */
function useRecentRounds(fromBuild: PublishedRound[] | undefined): PublishedRound[] {
  const [rounds, setRounds] = useState(() => fromBuild ?? readPrerenderedData<AiDebatePageData>(ROUTE)?.recentRounds);
  useEffect(() => {
    if (rounds) return;
    const controller = new AbortController();
    listPublishedRounds(RECENT_ROUNDS, controller.signal).then(setRounds, (): void => undefined);
    return () => controller.abort();
  }, [rounds]);
  return rounds ?? [];
}

function Speech({ speaker, children }: { speaker: string; children: string }) {
  return (
    <p>
      <strong>{speaker}:</strong> {children}
    </p>
  );
}

export default function AiDebatePage({ recentRounds: fromBuild }: { recentRounds?: PublishedRound[] }) {
  const { t } = useTranslation('tools');
  usePageHead(ROUTE);
  const recentRounds = useRecentRounds(fromBuild);

  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <header className="border-b border-border/60">
        <div className="container flex h-14 items-center justify-between gap-4 px-4">
          <Link to="/" aria-label={t('translation:common.homeLink')} className="flex items-center gap-2 rounded-md pointer-coarse:min-h-11">
            <OwlMark size={32} alt={t('translation:common.logoAlt')} />
            <span className="font-display text-lg font-[600] tracking-[-0.01em] text-heading">{site.product}</span>
          </Link>
          <Link to="/tools" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
            {t('layout.allTools')}
          </Link>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} className="container mx-auto px-4 pb-16 pt-6 focus-visible:outline-hidden">
        <nav aria-label={t('layout.breadcrumb')} className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link to="/" className="inline-flex min-h-6 items-center hover:text-foreground pointer-coarse:min-h-11">{site.product}</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground">{NAME}</li>
          </ol>
        </nav>
        <div className="mx-auto mt-6 max-w-[68ch]">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Debate an AI that argues back</h1>
          <p className="mt-3 text-lg leading-8 text-muted-foreground">
            {site.product} is an AI debate partner: pick a motion and a side, make your argument, and an AI opponent rebuts it. Try one exchange below with no account.
          </p>
          <div className="mt-6">
            <MiniRound />
          </div>
          <section aria-labelledby="short-answer" className="mt-10">
            <h2 id="short-answer" className="text-xl font-semibold tracking-tight text-foreground">{SHORT_ANSWER.question}</h2>
            <p className="mt-2 leading-7 text-foreground">{SHORT_ANSWER.answer}</p>
          </section>
        </div>

        <ToolArticle className="mt-14">
          <section>
            <h2>How it works</h2>
            <ol>
              <li>Pick a motion from the list or write your own, and choose For or Against.</li>
              <li>Write your argument: a claim, the reason it is true, and why it matters. Up to 600 characters is enough for one strong point.</li>
              <li>Read the AI&apos;s rebuttal and the judge note on your weakest link, then send one reply to see how the AI handles a comeback.</li>
            </ol>
            <p>The AI argues the side you did not pick, answers your strongest point first and does not make up statistics or sources. The judge note is not a score. It names the one step a judge would most likely attack, so you know what to fix before your next round.</p>
          </section>

          <section>
            <h2>A worked example round</h2>
            <p>The motion below is invented for this example, and so is the town.</p>
            <p><strong>Motion:</strong> This House would replace bus fares in the town of Larkmoor with a flat yearly pass. <strong>Your side:</strong> For.</p>
            <Speech speaker="You">A yearly pass makes the bus the default. People who have already paid stop weighing each trip against the car, so ridership rises, traffic falls and the buses run fuller for the same cost.</Speech>
            <Speech speaker="AI opponent">The pass only changes behaviour for people who buy it, and the ones who buy it are the ones already riding. A driver who takes the bus twice a year will not pay up front for something they barely use, so the drivers you need to win over stay in their cars. Meanwhile the town loses the fare income from occasional riders, and fuller buses on popular routes mean nothing for the villages where the bus runs twice a day.</Speech>
            <p><strong>Judge note:</strong> You assume buying the pass changes habits, but you never say who buys it. Name the group you expect to switch.</p>
            <Speech speaker="You">Then the pass has to be priced for the people on the margin: commuters who drive because a weekly ticket costs more than parking. At a price below a month of parking, they buy it, and once they have it the bus wins every trip.</Speech>
            <Speech speaker="AI opponent">Now the case depends on a price you have not set and on parking costs that differ across the town. If the pass is cheap enough to beat parking, the fare income gap gets bigger, and the motion does not say who pays for it.</Speech>
            <p><strong>Judge note:</strong> Good repair on who switches. The funding question is now the clash; answer it before the AI does.</p>
            <p>Two turns were enough to move the debate from &quot;passes are good&quot; to the real clash, cost against ridership. That is the point of practicing against an opponent instead of rereading your own case.</p>
          </section>

          <section>
            <h2>What you get in the full app</h2>
            <ul>
              <li><strong>Sparring:</strong> a whole timed round against an AI opponent, speech by speech, with a timer for each speech and a scorecard at the end.</li>
              <li><strong>Crossfire:</strong> timed question-and-answer drills for cross-examination.</li>
              <li><strong>Case generator:</strong> a case for your motion and side, with an opening, arguments with evidence, &quot;If they say…&quot; replies, a closing and the sources it used.</li>
              <li><strong>Case attacker:</strong> paste the other side&apos;s case to find its weak points and get responses you can use against it.</li>
            </ul>
          </section>

          <section>
            <h2>Formats supported</h2>
            <p>Sparring runs three formats: the school 4-6-6-3 format (Introductor, R1, R2 and Conclusor for each side), Lincoln-Douglas and Public Forum. Each uses its own speech order and time limits, and the AI opponent does the job of the speech it is giving. For other formats, the free <Link to="/tools/debate-timer">debate timer</Link> covers BP, World Schools, Policy and Asian Parliamentary timing.</p>
          </section>

          <section>
            <h2>{site.product} vs general chatbots</h2>
            <p>You can ask any general chatbot to argue against you, and for a quick back-and-forth it will. What it will not do on its own is keep a round: speech order, time limits, staying on the other side when you push back, and a scorecard that quotes what each side actually said. {site.product} is built for that part. If you want to compare the options by debate job, see <a href="/best-ai-for-debate">which AI is best for debate</a>.</p>
          </section>

          {recentRounds.length > 0 && (
            <section aria-labelledby="published-rounds">
              <h2 id="published-rounds">Rounds visitors published</h2>
              <p>Visitors can publish a finished mini round as its own page. These are the newest; personal details are removed before a round goes up.</p>
              <ul>
                {recentRounds.map((round) => (
                  <li key={round.slug}>
                    <Link to={publishedRoundPath(round.slug)}>{round.motion}</Link> ({sideLabel(round.side)})
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ToolFaq faq={FAQ} />

          <TrialCta />
        </ToolArticle>
      </main>
      <Footer />
      {/* In the body, so the dev server and the prerendered HTML carry the same JSON-LD. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData()) }} />
    </div>
  );
}
