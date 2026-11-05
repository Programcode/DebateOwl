import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import site from '@/config/site.json';
import { cn } from '@/lib/utils';
import {
  ARGUMENT_MAX,
  DEMO_CLIENT_ENABLED,
  DemoTurnError,
  loadTurnstile,
  MOTION_MAX,
  PRESET_MOTIONS,
  publishDemoRound,
  requestDemoTurn,
  TURNSTILE_SITE_KEY,
  unpublishDemoRound,
  type DemoSide,
  type PublishDemoReply,
} from '@/lib/ai-debate-demo';
import { publishedRoundPath } from '@/lib/published-rounds';

const CUSTOM = 'custom';
const fieldClass = 'mt-1.5';

/** The one sample exchange the page shows without JavaScript, or while the live demo is off. */
export const SAMPLE_ROUND = {
  motion: 'This House would replace school sports days with a week of outdoor learning',
  side: 'For',
  argument: 'Sports days reward the few pupils who are already athletic and leave everyone else watching. A week of outdoor learning gets every pupil moving and teaches skills like map reading and teamwork that last longer than one race.',
  rebuttal: 'My opponent assumes a sports day only serves athletes, but most sports days are built around house points, relay teams and novelty races where effort counts as much as speed. That is exactly the teamwork they want. Their alternative also costs a school a full week of lessons, staff cover and transport, while a sports day costs one afternoon. If the problem is that some pupils feel left out, the fix is to redesign the events, not to cancel the one day the whole school competes together. And a week outdoors does not guarantee that anyone moves more: without competition, many pupils will do the minimum.',
  judgeNote: 'Weakest link: "skills that last longer than one race" is asserted, not shown. Give one reason or example of why outdoor learning sticks.',
} as const;

export function Exchange({ argument, rebuttal, judgeNote, label }: { argument: string; rebuttal: string; judgeNote: string; label: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-background p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 whitespace-pre-line text-foreground">{argument}</p>
      </div>
      <div className="rounded-lg border-2 border-brand-tint-border bg-brand-tint p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">AI opponent</p>
        <p className="mt-1 whitespace-pre-line text-foreground" data-testid="demo-rebuttal">{rebuttal}</p>
      </div>
      {/* A reply the server saved from a cut-off answer can come without one. */}
      {judgeNote && (
        <p className="rounded-lg bg-surface-sunken px-4 py-3 text-sm text-foreground" data-testid="demo-judge-note">
          <span className="font-bold">Judge note: </span>{judgeNote}
        </p>
      )}
    </div>
  );
}

export function TrialCta() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-center">
      {/* Also shown inside the article, whose link colour would otherwise win over the button's. */}
      <Link to="/login" className={cn(buttonVariants({ size: 'lg' }), 'not-prose h-auto min-h-12 whitespace-normal py-3 text-(--btn-fg)! no-underline!')}>
        Run a full timed round: start your {site.pricing.trialDays}-day trial
      </Link>
      <p className="mt-2 text-sm text-muted-foreground">Then ${site.pricing.proMonthly}/month + tax. Cancel anytime.</p>
    </div>
  );
}

function SampleRound() {
  return (
    <div className="space-y-4" data-testid="demo-sample">
      <p className="text-sm text-muted-foreground">
        A sample exchange. <span className="font-semibold text-foreground">Motion:</span> {SAMPLE_ROUND.motion}. <span className="font-semibold text-foreground">Side:</span> {SAMPLE_ROUND.side}.
      </p>
      <Exchange label="Your argument" argument={SAMPLE_ROUND.argument} rebuttal={SAMPLE_ROUND.rebuttal} judgeNote={SAMPLE_ROUND.judgeNote} />
      <TrialCta />
    </div>
  );
}

const ERRORS: Record<string, string> = {
  ip_limit: 'You have used today’s demo rounds on this network. Start a trial to keep practicing.',
  turn_limit: 'That was the last reply in this demo round. Start a trial for a full timed round.',
  daily_limit: 'Today’s demo rounds are used up. Come back tomorrow, or start a trial now.',
  not_allowed: 'That motion or argument cannot be used in the demo. Try a different one.',
  bot_check_failed: 'The bot check did not pass. Wait for it to finish and try again.',
  // The session token expired, or the round started before midnight UTC.
  unknown_session: 'This demo round has expired. Reload the page to start a new one.',
  // The first exchange did not match what the server sent, for example after a deploy mid-round.
  invalid_round: 'This demo round cannot continue. Reload the page to start a new one.',
};
const ENDS_DEMO = new Set(['ip_limit', 'turn_limit', 'daily_limit', 'unknown_session', 'invalid_round']);

type Turn = { argument: string; rebuttal: string; judgeNote: string; signature: string };

const PUBLISH_ERRORS: Record<string, string> = {
  unknown_session: 'This round is too old to publish. A round can be published for two hours after it starts.',
  invalid_round: 'This round could not be verified, so it was not published.',
  demo_disabled: 'Publishing is switched off right now.',
};

/**
 * Publishing a finished round is opt-in: nothing leaves the browser until the
 * visitor ticks the box and presses Publish. The function removes personal
 * details and decides whether search engines may list the page.
 */
function PublishPanel({ round }: { round: Parameters<typeof publishDemoRound>[0] }) {
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishDemoReply | null>(null);
  const [removed, setRemoved] = useState(false);

  async function publish() {
    setPending(true);
    setError(null);
    try {
      setPublished(await publishDemoRound(round));
    } catch (caught) {
      const code = caught instanceof DemoTurnError ? caught.code : 'unavailable';
      setError(PUBLISH_ERRORS[code] ?? 'The round could not be published. Try again in a minute.');
    } finally {
      setPending(false);
    }
  }

  async function unpublish() {
    if (!published) return;
    setPending(true);
    setError(null);
    try {
      await unpublishDemoRound(published.slug, published.deleteToken);
      setRemoved(true);
    } catch {
      setError('The page could not be taken down. Try again in a minute.');
    } finally {
      setPending(false);
    }
  }

  if (removed) {
    return <p role="status" className="rounded-xl border border-border p-4 text-sm text-foreground" data-testid="demo-unpublished">The public page is gone. Your round is private again.</p>;
  }

  if (published) {
    const path = publishedRoundPath(published.slug);
    return (
      <div className="space-y-3 rounded-xl border border-border p-4 text-sm" data-testid="demo-published">
        <p role="status" className="font-semibold text-foreground">
          Published. <Link to={path} className="text-primary underline underline-offset-4">Open your public round</Link>
        </p>
        {published.redactions > 0 && (
          <p className="text-muted-foreground">We removed {published.redactions === 1 ? 'one personal detail' : `${published.redactions} personal details`} before publishing.</p>
        )}
        <p className="text-muted-foreground" data-testid="demo-published-indexing">
          {published.indexable
            ? 'Anyone with the link can read it, and search engines may list it.'
            : 'Anyone with the link can read it, but search engines are asked not to list it: it is short, repeats a motion and side already listed, or had personal details removed.'}
        </p>
        <Button type="button" variant="outline" onClick={unpublish} disabled={pending}>Unpublish</Button>
        <p className="text-xs text-muted-foreground">You can also unpublish later from the round&apos;s page in this browser. The page shows as removed at once; a copy already built into the site is cleared at the next site update.</p>
        {error && <p role="alert" className="font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4 text-sm" data-testid="demo-publish">
      <p className="font-semibold text-foreground">Your round is private.</p>
      <p className="text-muted-foreground">
        Nothing you typed is kept unless you publish the round. A published round gets its own public page on {new URL(site.origin).host} that anyone with the link can read, and that search engines may list if it is long enough.
      </p>
      <div className="flex items-start gap-3">
        <Checkbox id="demo-publish-consent" checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
        <Label htmlFor="demo-publish-consent" className="leading-5">
          Publish this round as a public page. It holds no name, contact detail or other personal information about me or anyone else.
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Before publishing we also remove email addresses, phone numbers, links, @handles and names given with &quot;my name is&quot; or a title such as Mr or Dr. Pages where something was removed are kept out of search results.
      </p>
      <Button type="button" onClick={publish} disabled={!consent || pending}>
        {pending ? 'Publishing…' : 'Publish round'}
      </Button>
      {error && <p role="alert" className="font-medium text-destructive">{error}</p>}
    </div>
  );
}

function LiveRound({ onDisabled }: { onDisabled: () => void }) {
  const [preset, setPreset] = useState<string>(PRESET_MOTIONS[0]);
  const [customMotion, setCustomMotion] = useState('');
  const [side, setSide] = useState<DemoSide>('for');
  const [argument, setArgument] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<{ id: string; token?: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [turnsLeft, setTurnsLeft] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const motion = (preset === CUSTOM ? customMotion : preset).trim();
  const started = turns.length > 0;
  const finished = ended || (started && turnsLeft === 0);

  // The bot check runs once, before the first call.
  useEffect(() => {
    if (started) return;
    let cancelled = false;
    loadTurnstile().then((turnstile) => {
      if (cancelled || !widgetRef.current || widgetId.current) return;
      widgetId.current = turnstile.render(widgetRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'ai-debate-demo',
        callback: (value: string) => setToken(value),
        'expired-callback': () => setToken(null),
        'error-callback': () => setToken(null),
      });
    }).catch(() => {
      if (!cancelled) setError('The bot check could not load. Check your connection or ad blocker and reload the page.');
    });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [started]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = argument.trim();
    if (!text || !motion || pending) return;
    setPending(true);
    setError(null);
    try {
      const first = turns[0];
      const reply = await requestDemoTurn(started && session && first
        ? { sessionId: session.id, sessionToken: session.token, motion, side, argument: text, previous: first }
        : { turnstileToken: token ?? undefined, motion, side, argument: text });
      if (!started) setSession({ id: reply.sessionId, token: reply.sessionToken });
      setTurns((previous) => [...previous, { argument: text, rebuttal: reply.rebuttal, judgeNote: reply.judgeNote, signature: reply.signature }]);
      setTurnsLeft(reply.turnsLeft);
      setArgument('');
    } catch (caught) {
      const code = caught instanceof DemoTurnError ? caught.code : 'unavailable';
      if (code === 'demo_disabled') {
        onDisabled();
        return;
      }
      if (ENDS_DEMO.has(code)) setEnded(true);
      if (!started && widgetId.current) {
        // A Turnstile token is single-use; a new attempt needs a new one.
        setToken(null);
        window.turnstile?.reset(widgetId.current);
      }
      setError(ERRORS[code] ?? 'The AI opponent is unavailable right now. Try again in a minute.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {!started && (
        <form onSubmit={submit} className="space-y-4" aria-label="Mini AI debate round">
          <div>
            <Label htmlFor="demo-motion">Motion</Label>
            <select
              id="demo-motion"
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
              className={cn(fieldClass, 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11')}
            >
              {PRESET_MOTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              <option value={CUSTOM}>Write my own motion</option>
            </select>
          </div>
          {preset === CUSTOM && (
            <div>
              <Label htmlFor="demo-custom-motion">Your motion</Label>
              <Input
                id="demo-custom-motion"
                className={fieldClass}
                value={customMotion}
                maxLength={MOTION_MAX}
                placeholder="This House would…"
                onChange={(event) => setCustomMotion(event.target.value)}
                required
              />
            </div>
          )}
          <fieldset>
            <legend className="text-sm font-medium leading-none">Your side</legend>
            <div className="mt-2 flex gap-2">
              {(['for', 'against'] as const).map((value) => (
                <label
                  key={value}
                  className={cn(
                    'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-semibold has-focus-visible:ring-2 has-focus-visible:ring-ring',
                    side === value ? 'border-primary bg-brand-tint text-heading' : 'border-border text-muted-foreground',
                  )}
                >
                  <input type="radio" name="demo-side" value={value} checked={side === value} onChange={() => setSide(value)} className="sr-only" />
                  {value === 'for' ? 'For' : 'Against'}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="demo-argument">Your argument</Label>
            <Textarea
              id="demo-argument"
              className={cn(fieldClass, 'min-h-28')}
              value={argument}
              maxLength={ARGUMENT_MAX}
              placeholder="Make your case in a few sentences: the claim, why it is true, and why it matters."
              onChange={(event) => setArgument(event.target.value)}
              required
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{argument.length}/{ARGUMENT_MAX}</p>
          </div>
          <div ref={widgetRef} />
          <Button type="submit" size="lg" disabled={pending || !token || !argument.trim() || !motion}>
            {pending ? 'The AI is answering…' : 'Get the AI’s rebuttal'}
          </Button>
        </form>
      )}

      {started && (
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Motion:</span> {motion}. <span className="font-semibold text-foreground">Your side:</span> {side === 'for' ? 'For' : 'Against'}.
        </p>
      )}
      <div aria-live="polite" className="space-y-5">
        {turns.map((turn, index) => (
          <Exchange key={index} label={index === 0 ? 'Your argument' : 'Your reply'} argument={turn.argument} rebuttal={turn.rebuttal} judgeNote={turn.judgeNote} />
        ))}
      </div>

      {started && !finished && (
        <form onSubmit={submit} className="space-y-3" aria-label="Reply to the AI opponent">
          <div>
            <Label htmlFor="demo-follow-up">Your reply (one more turn)</Label>
            <Textarea
              id="demo-follow-up"
              className={cn(fieldClass, 'min-h-24')}
              value={argument}
              maxLength={ARGUMENT_MAX}
              placeholder="Answer the rebuttal: what did it get wrong?"
              onChange={(event) => setArgument(event.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={pending || !argument.trim()}>
            {pending ? 'The AI is answering…' : 'Send reply'}
          </Button>
        </form>
      )}

      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      {finished && session?.token && turns.length > 0 && (
        <PublishPanel round={{ sessionId: session.id, sessionToken: session.token, motion, side, turns }} />
      )}
      {finished && <TrialCta />}
    </div>
  );
}

/**
 * The mini round at the top of /ai-debate. The prerendered HTML and every
 * visitor without the live demo get the sample exchange; the form appears
 * after mount, so a build with the demo on never prerenders a form that
 * cannot work without JavaScript.
 */
export function MiniRound() {
  const [live, setLive] = useState(false);
  useEffect(() => setLive(DEMO_CLIENT_ENABLED), []);
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm sm:p-6">
      {live ? <LiveRound onDisabled={() => setLive(false)} /> : <SampleRound />}
    </div>
  );
}
