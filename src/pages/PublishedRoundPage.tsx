import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { OwlMark } from '@/components/brand/Owl';
import Footer from '@/components/landing/Footer';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/SkipLink';
import { Exchange, TrialCta } from '@/components/ai-debate/MiniRound';
import { Button } from '@/components/ui/button';
import site from '@/config/site.json';
import { deleteTokenFor, unpublishDemoRound } from '@/lib/ai-debate-demo';
import {
  fetchPublishedRound,
  publishedRoundPath,
  roundDescription,
  roundTitle,
  sideLabel,
  type PublishedRound,
  type RoundLink,
} from '@/lib/published-rounds';
import { readPrerenderedData } from '@/lib/seo/prerendered-data';
import { useDataPageHead } from '@/lib/seo/use-page-head';

/** What the build embeds with a prerendered round (src/prerender/entry.tsx). */
export interface PublishedRoundData {
  route: string;
  round: PublishedRound;
  /** Neighbouring indexable rounds, so every listed round is linked from others. */
  related: RoundLink[];
}

const publishedOn = (round: PublishedRound) =>
  new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(round.publishedAt));

/** A published round as a page. The build renders it with the same props, so the static HTML matches. */
export function PublishedRoundView({ round, related, owner }: { round: PublishedRound; related: RoundLink[]; owner?: ReactNode }) {
  const { t } = useTranslation('tools');
  const opponent = round.side === 'for' ? 'Against' : 'For';
  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <header className="border-b border-border/60">
        <div className="container flex h-14 items-center justify-between gap-4 px-4">
          <Link to="/" aria-label={t('translation:common.homeLink')} className="flex items-center gap-2 rounded-md pointer-coarse:min-h-11">
            <OwlMark size={32} alt={t('translation:common.logoAlt')} />
            <span className="font-display text-lg font-[600] tracking-[-0.01em] text-heading">{site.product}</span>
          </Link>
          <Link to="/ai-debate" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
            Try the mini round
          </Link>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} className="container mx-auto px-4 pb-16 pt-6 focus-visible:outline-hidden">
        <nav aria-label={t('layout.breadcrumb')} className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link to="/" className="inline-flex min-h-6 items-center hover:text-foreground pointer-coarse:min-h-11">{site.product}</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/ai-debate" className="inline-flex min-h-6 items-center hover:text-foreground pointer-coarse:min-h-11">AI debate partner</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground">Published round</li>
          </ol>
        </nav>
        <article className="mx-auto mt-6 max-w-[68ch] space-y-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl" data-testid="published-motion">{round.motion}</h1>
            <p className="mt-3 text-muted-foreground">
              <span className="font-semibold text-foreground">Visitor:</span> {sideLabel(round.side)}. <span className="font-semibold text-foreground">AI opponent:</span> {opponent}. Published {publishedOn(round)}.
            </p>
          </div>

          <section aria-labelledby="short-answer">
            <h2 id="short-answer" className="text-xl font-semibold tracking-tight text-foreground">What is this round?</h2>
            <p className="mt-2 leading-7 text-foreground">
              A short practice exchange from {site.product}&apos;s free mini round, published by the visitor who argued it. They argued {round.side} the motion, the AI opponent argued {opponent.toLowerCase()} it, and a judge note after each turn names the weakest link in the visitor&apos;s argument.
            </p>
          </section>

          <section aria-labelledby="exchange-heading" className="space-y-5">
            <h2 id="exchange-heading" className="text-xl font-semibold tracking-tight text-foreground">The exchange</h2>
            {round.turns.map((turn, index) => (
              <Exchange key={index} label={index === 0 ? 'Visitor’s argument' : 'Visitor’s reply'} {...turn} />
            ))}
            {owner}
          </section>

          <section aria-labelledby="try-heading" className="space-y-3">
            <h2 id="try-heading" className="text-xl font-semibold tracking-tight text-foreground">Argue a round yourself</h2>
            <p className="leading-7 text-foreground">
              The <Link to="/ai-debate" className="text-primary underline underline-offset-4">mini round</Link> is free and needs no account: one argument, one AI rebuttal with a judge note, and one reply. Full timed rounds with a scorecard are in the app.
            </p>
            <TrialCta />
          </section>

          {related.length > 0 && (
            <section aria-labelledby="related-heading">
              <h2 id="related-heading" className="text-xl font-semibold tracking-tight text-foreground">More published rounds</h2>
              <ul className="mt-3 space-y-2">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link to={publishedRoundPath(item.slug)} className="text-primary underline underline-offset-4">{item.motion}</Link>
                    <span className="text-muted-foreground"> ({sideLabel(item.side)})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-sm text-muted-foreground">
            Published by a visitor. {site.product} removes contact details and introduced names before publishing, and the AI&apos;s replies do not cite real sources. To report this page, email <a href={`mailto:${site.contactEmail}`} className="underline underline-offset-4">{site.contactEmail}</a>.
          </p>
        </article>
      </main>
      <Footer />
    </div>
  );
}

/** Unpublish, for the browser that published the round. */
function OwnerControls({ slug, onRemoved }: { slug: string; onRemoved: () => void }) {
  const [token] = useState(() => deleteTokenFor(slug));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  if (!token) return null;
  async function unpublish() {
    setPending(true);
    setError(false);
    try {
      await unpublishDemoRound(slug, token!);
      onRemoved();
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return (
    <div className="rounded-xl border border-border p-4 text-sm" data-testid="published-owner">
      <p className="text-foreground">You published this round from this browser.</p>
      <Button type="button" variant="outline" className="mt-3" onClick={unpublish} disabled={pending}>Unpublish this round</Button>
      {error && <p role="alert" className="mt-2 font-medium text-destructive">The page could not be taken down. Try again in a minute.</p>}
    </div>
  );
}

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'ready'; round: PublishedRound; related: RoundLink[] };

/**
 * /ai-debate/round/:slug. A prerendered round renders from the data the build
 * embedded and is then checked again, so a round taken down since the build
 * shows as removed. Any other round is fetched, under a noindex head unless
 * it is indexable.
 */
export default function PublishedRoundPage() {
  const { slug = '' } = useParams();
  const route = publishedRoundPath(slug);
  const [state, setState] = useState<State>(() => {
    const data = readPrerenderedData<PublishedRoundData>(route);
    return data ? { status: 'ready', round: data.round, related: data.related } : { status: 'loading' };
  });

  // Set once this browser unpublishes the round: a read that started before then must not bring it back.
  const removed = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPublishedRound(slug, controller.signal).then((round) => {
      if (removed.current) return;
      setState((previous) => (round
        ? { status: 'ready', round, related: previous.status === 'ready' ? previous.related : [] }
        : { status: 'missing' }));
    }, () => {
      if (!controller.signal.aborted) setState((previous) => (previous.status === 'ready' ? previous : { status: 'error' }));
    });
    return () => controller.abort();
  }, [slug]);

  const head = useMemo(() => (state.status === 'ready'
    ? { title: roundTitle(state.round), description: roundDescription(state.round), ...(state.round.indexable ? { canonicalPath: route } : {}) }
    : null), [state, route]);
  useDataPageHead(head);

  if (state.status === 'ready') {
    return (
      <PublishedRoundView
        round={state.round}
        related={state.related}
        owner={<OwnerControls slug={slug} onRemoved={() => { removed.current = true; setState({ status: 'missing' }); }} />}
      />
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <main id={MAIN_CONTENT_ID} className="container mx-auto max-w-[68ch] px-4 py-16 focus-visible:outline-hidden">
        {state.status === 'loading' ? (
          <p className="text-muted-foreground" role="status">Loading the round…</p>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="published-missing">
              {state.status === 'missing' ? 'This round is not published' : 'This round could not be loaded'}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {state.status === 'missing'
                ? 'The visitor who published it may have taken it down, or the link is wrong.'
                : 'Check your connection and reload the page.'}
            </p>
            <Link to="/ai-debate" className="mt-6 inline-block text-primary underline underline-offset-4">Argue a round against the AI</Link>
          </>
        )}
      </main>
    </div>
  );
}
