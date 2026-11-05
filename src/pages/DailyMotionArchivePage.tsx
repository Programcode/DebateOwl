import { Link } from 'react-router-dom';
import { ToolArticle } from '@/components/free-tools/ToolPageLayout';
import { DailyMotionShell } from '@/components/daily-motion/DailyMotion';
import { ARCHIVE_PATH, dailyMotionPath, formatName, longDate } from '@/lib/daily-motion/pages';
import { pastDailyMotions, type DailyMotion } from '@/lib/daily-motion/schedule';
import { BRAND, PAGE_HEADS, PRICING, SITE_ORIGIN } from '@/lib/seo/pages';
import { jsonLd } from '@/lib/seo/tool-pages';
import { usePageHead } from '@/lib/seo/use-page-head';

const URL = `${SITE_ORIGIN}${ARCHIVE_PATH}`;

function structuredData(days: DailyMotion[]) {
  const head = PAGE_HEADS[ARCHIVE_PATH];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${URL}#webpage`,
        url: URL,
        name: head.title,
        description: head.description,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        // The archive changes when a new day is added.
        dateModified: days[0].date,
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: days.map((day, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: `Daily Motion #${day.number}: ${day.wording}`,
            url: `${SITE_ORIGIN}${dailyMotionPath(day.number)}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: BRAND, item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Daily motion', item: URL },
        ],
      },
    ],
  };
}

export default function DailyMotionArchivePage() {
  usePageHead(ARCHIVE_PATH);
  const days = pastDailyMotions();

  return (
    <DailyMotionShell crumbs={[{ label: 'Daily motion' }]}>
      <div className="mx-auto mt-6 max-w-[68ch]">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Daily debate motion</h1>
        <p className="mt-3 text-lg leading-8 text-muted-foreground">
          One numbered motion a day, the same for everyone, set for a real format: Public Forum, Lincoln-Douglas or the School 4-6-6-3 format. Each day comes with that format&apos;s speech times, the clash, one line for each side and what the ballot will turn on.
        </p>
      </div>

      <ToolArticle className="mt-12">
        <section>
          <h2 id="short-answer">What is the Daily Motion?</h2>
          <p>
            A practice motion for the day, numbered so a club or class can say &quot;we did #12&quot;. Every motion is original, written for school and club debaters rather than copied from a tournament archive, and each day is set for one format so you prepare for the speeches you will actually give. A new motion appears at midnight UTC.
          </p>
          <p>
            Argue it once against the AI on <a href="/ai-debate">the free AI debate partner</a>, no account needed, or run the whole round with its speech times and a judged scorecard in Sparring ({PRICING.trialDays}-day trial, then ${PRICING.proMonthly}/month plus tax).
          </p>
        </section>

        <section aria-labelledby="archive-heading">
          <h2 id="archive-heading">Every daily motion</h2>
          <ol className="list-none! pl-0! divide-y divide-border/60" data-testid="daily-motion-archive">
            {days.map((day) => (
              <li key={day.number} className="mt-0! py-3">
                <p className="mt-0! text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  #{day.number} · <time dateTime={day.date}>{longDate(day.date)}</time> · {formatName(day)}
                </p>
                <Link to={dailyMotionPath(day.number)} className="mt-1 inline-block font-medium text-foreground! no-underline! hover:underline!">{day.wording}</Link>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2>How to use it with a team</h2>
          <ul>
            <li>Post the day&apos;s link in your team chat. The number and the date make it easy to refer back to.</li>
            <li>Split the squad by side, give each pair the strongest line for their side as a starting point, and time the speeches with the <Link to="/tools/debate-timer">debate timer</Link>.</li>
            <li>After the round, read the ballot note together: it names what a judge would most likely decide on.</li>
            <li>Want more than one motion a day? The <Link to="/tools/debate-motion-generator">motion generator</Link> draws from the whole bank of {BRAND} practice motions.</li>
          </ul>
        </section>
      </ToolArticle>
      {/* In the body, so the dev server and the prerendered HTML carry the same JSON-LD. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData(days)) }} />
    </DailyMotionShell>
  );
}
