import { Link, Route, Routes, useParams } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { FormatReference } from '@/components/free-tools/FormatReference';
import { ToolArticle } from '@/components/free-tools/ToolPageLayout';
import { DailyMotionShell } from '@/components/daily-motion/DailyMotion';
import { ARCHIVE_PATH, dailyMotionHead, dailyMotionPath, formatName, longDate } from '@/lib/daily-motion/pages';
import { MOTION_MAX } from '@/lib/ai-debate-demo';
import { BALLOT_GUIDE, dailyMotion, latestDayNumber, pastDailyMotions, SPARRING_FORMATS, type DailyMotion, type DailyMotionFormat } from '@/lib/daily-motion/schedule';
import { FORMATS, type RoundFormat } from '@/lib/free-tools/formats';
import { BRAND, PRICING, SITE_ORIGIN, type PageHead } from '@/lib/seo/pages';
import { jsonLd } from '@/lib/seo/tool-pages';
import { useDataPageHead } from '@/lib/seo/use-page-head';
import { cn } from '@/lib/utils';
import NotFound from '@/pages/NotFound';

/** The free timer's format for each day's format: its speech order, times and sources. */
const TIMER_FORMATS: Record<DailyMotionFormat, RoundFormat> = { pf: FORMATS.pf, ld: FORMATS.ld, school: FORMATS.school };

/** The free /ai-debate mini round with this motion filled in. */
const aiDebateHref = (day: DailyMotion) => `/ai-debate?${new URLSearchParams({ motion: day.wording.slice(0, MOTION_MAX) })}`;
/** A full Sparring round in the day's format (sign-in and trial first). */
const sparringHref = (day: DailyMotion) => `/app/sparring?${new URLSearchParams({ motion: day.wording, format: SPARRING_FORMATS[day.format] })}`;

function structuredData(day: DailyMotion, head: PageHead) {
  const url = `${SITE_ORIGIN}${head.canonicalPath}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: head.title,
        description: head.description,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        datePublished: day.date,
        dateModified: day.date,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: BRAND, item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Daily motion', item: `${SITE_ORIGIN}${ARCHIVE_PATH}` },
          { '@type': 'ListItem', position: 3, name: `#${day.number}`, item: url },
        ],
      },
    ],
  };
}

/** Up to four other days, the same format first, so every day is linked from more than its neighbours. */
function moreMotions(day: DailyMotion): DailyMotion[] {
  const others = pastDailyMotions().filter((other) => Math.abs(other.number - day.number) > 1);
  return [...others.filter((other) => other.format === day.format), ...others.filter((other) => other.format !== day.format)].slice(0, 4);
}

const sideNames = (day: DailyMotion) => (day.format === 'ld' ? ['Affirmative', 'Negative'] : ['Pro', 'Con']);

function DayPage({ day }: { day: DailyMotion }) {
  const head = dailyMotionHead(day);
  useDataPageHead(head);
  const format = TIMER_FORMATS[day.format];
  const otherWording = day.format === 'school' ? day.resolved : day.house;
  const [pro, con] = sideNames(day);
  const previous = day.number > 1 ? day.number - 1 : undefined;
  const next = day.number < latestDayNumber() ? day.number + 1 : undefined;
  const more = moreMotions(day);

  return (
    <DailyMotionShell crumbs={[{ label: 'Daily motion', to: ARCHIVE_PATH }, { label: `#${day.number}` }]}>
      <div className="mx-auto mt-6 max-w-[68ch]">
        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Daily motion #{day.number} · <time dateTime={day.date}>{longDate(day.date)}</time> · {format.name}
        </p>
        <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl" data-testid="daily-motion-wording">{day.wording}</h1>
        <p className="mt-3 text-muted-foreground">
          {day.format === 'school' ? 'US-format wording' : 'Parliamentary wording'}: {otherWording}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {/* A plain link: /ai-debate reads the motion from the address when it loads. */}
          <a href={aiDebateHref(day)} className={cn(buttonVariants({ size: 'lg' }), 'h-auto min-h-12 whitespace-normal py-3')}>
            Argue it against the AI, free
          </a>
          <a href={sparringHref(day)} className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'h-auto min-h-12 whitespace-normal py-3')}>
            Run a full {format.shortName} round in Sparring
          </a>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          The one-exchange round on /ai-debate needs no account. Sparring runs the whole round with its speech times and a judged scorecard; it starts with a {PRICING.trialDays}-day trial, then ${PRICING.proMonthly}/month plus tax.
        </p>
      </div>

      <ToolArticle className="mt-12">
        <section>
          <h2 id="short-answer">What does this round turn on?</h2>
          <p>{day.clash}</p>
        </section>

        <section>
          <h2>The strongest line for each side</h2>
          <p><strong>{pro}:</strong> {day.pro}</p>
          <p><strong>{con}:</strong> {day.con}</p>
          <p>These are starting points, not cases. Build each into a full argument with a reason and an impact, then test it against the other side&apos;s line before the round.</p>
        </section>

        <section>
          <h2>What the ballot will turn on</h2>
          <p>{day.ballot}</p>
          <p>{BALLOT_GUIDE[day.format]}</p>
        </section>

        <section>
          <h2>Speech times for {format.name}</h2>
          <p>The round below is the standard {format.name} order. Run it on the <Link to={`/tools/debate-timer?format=${day.format}`}>free debate timer</Link>, which is already set to this format.</p>
          <FormatReference format={format} />
        </section>

        <nav aria-label="Other daily motions">
          <h2>More daily motions</h2>
          <ul>
            {previous && <li><Link to={dailyMotionPath(previous)}>Previous: #{previous}</Link></li>}
            {next && <li><Link to={dailyMotionPath(next)}>Next: #{next}</Link></li>}
            {more.map((other) => (
              <li key={other.number}>
                <Link to={dailyMotionPath(other.number)}>#{other.number}: {other.wording}</Link> ({formatName(other)})
              </li>
            ))}
            <li><Link to={ARCHIVE_PATH}>Every daily motion</Link></li>
            <li><Link to={`/tools/debate-motion-generator?m=${day.motionId}`}>This motion in the motion generator</Link>, to draw more like it</li>
          </ul>
        </nav>
      </ToolArticle>
      {/* In the body, so the dev server and the prerendered HTML carry the same JSON-LD. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData(day, head)) }} />
    </DailyMotionShell>
  );
}

export default function DailyMotionPage() {
  const { number } = useParams();
  // Only plain numbers: /motion/007 or /motion/1x is not a day.
  const day = number && /^[1-9]\d*$/.test(number) ? dailyMotion(Number(number)) : undefined;
  return day ? <DayPage key={day.number} day={day} /> : <NotFound />;
}

/** The page under its route, for the prerender, which renders pages outside the app's router. */
export function DailyMotionRoutes() {
  return <Routes><Route path="/motion/:number" element={<DailyMotionPage />} /></Routes>;
}
