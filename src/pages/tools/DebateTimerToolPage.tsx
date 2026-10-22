import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DebateTimer } from '@/components/free-tools/DebateTimer';
import { CustomFormatEditor } from '@/components/free-tools/CustomFormatEditor';
import { FormatReference } from '@/components/free-tools/FormatReference';
import { ToolCta, ToolFaq, ToolPageLayout } from '@/components/free-tools/ToolPageLayout';
import { BUILT_IN_FORMATS, FORMATS, isBuiltInFormatId, type BuiltInFormatId } from '@/lib/free-tools/formats';
import { captureProductEvent } from '@/lib/observability';
import { toolStructuredData, type FaqEntry } from '@/lib/seo/tool-pages';
import site from '@/config/site.json';

const NAME = 'Debate timer';

const FAQ: FaqEntry[] = [
  {
    question: 'Which debate formats does the timer know?',
    answer: 'Public Forum, Lincoln-Douglas and Policy as the NSDA runs them, British Parliamentary under the WUDC manual, World Schools under the WSDC rules, Asian Parliamentary under the UADC handbook, and the school 4-6-6-3 format. For anything else, build a custom format and share its link.',
  },
  {
    question: 'How does the timer show protected time?',
    answer: 'In British Parliamentary, World Schools and Asian Parliamentary speeches, a strip under the clock shows the protected first and last minute and the open stretch between them, with a marker for where the speaker is. A badge reads "POIs open" or "Protected", and you hear a knock when the window opens and closes.',
  },
  {
    question: 'What happens when a speaker goes over time?',
    answer: 'The clock keeps counting, now upwards with a plus sign and in red, so the judge can see exactly how far over the speaker went. In BP and Asian Parliamentary it first shows the 15-second grace period those rules allow.',
  },
  {
    question: 'How do the prep time banks work?',
    answer: 'Public Forum, Lincoln-Douglas and Policy rounds get one bank per side, with the NSDA allowance of 3, 4 and 8 minutes. Tap a side\'s bank to run it and tap again to stop. Starting a bank pauses the speech, and a bank that runs out stops at zero.',
  },
  {
    question: 'Will I lose the round if I reload the page?',
    answer: 'No. The timer saves the format, the current speech and both prep banks in this browser, against the wall clock, so a running speech is still running at the right time after a reload. Nothing is sent to a server.',
  },
  {
    question: 'Can I put this timer on my club or tournament website?',
    answer: 'Yes. Copy the iframe snippet for your format from the embed section on this page. The embedded timer has no ads, needs no account and makes no network requests beyond its own files.',
  },
];

function EmbedSnippets() {
  const { t } = useTranslation('tools');
  const [formatId, setFormatId] = useState<BuiltInFormatId>('bp');
  const [copied, setCopied] = useState(false);
  const format = FORMATS[formatId];
  const snippet = `<iframe src="${site.origin}/embed/debate-timer?format=${formatId}" title="${format.name} debate timer" width="100%" height="560" style="border:0;max-width:760px" allow="screen-wake-lock; fullscreen" allowfullscreen loading="lazy"></iframe>
<p><a href="${site.origin}/tools/debate-timer">Free debate timer by DebateLab</a></p>`;

  return (
    <div className="mt-4 space-y-3">
      <label className="flex flex-col gap-1 text-sm font-medium sm:flex-row sm:items-center sm:gap-3">
        {t('embed.format')}
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-base"
          value={formatId}
          onChange={(event) => { if (isBuiltInFormatId(event.target.value)) setFormatId(event.target.value); }}
        >
          {BUILT_IN_FORMATS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/50 p-3 text-xs"><code>{snippet}</code></pre>
      <Button
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(snippet).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }, (): undefined => undefined);
        }}
      >
        {copied ? t('embed.copied') : t('embed.copy')}
      </Button>
    </div>
  );
}

export default function DebateTimerToolPage() {
  return (
    <ToolPageLayout
      route="/tools/debate-timer"
      title="Free debate timer for every format"
      intro={<p>Choose a format and the timer already knows the speech order, the protected minutes and each side&apos;s prep time. It needs no account, runs entirely in this tab, and keeps your round if the page reloads.</p>}
      structuredData={toolStructuredData('/tools/debate-timer', NAME, FAQ)}
      tool={(
        <DebateTimer
          storageKey="debatelab-free-timer-v1"
          onFirstStart={(format) => captureProductEvent('free_tool_used', { freeTool: 'debate-timer', action: 'start', format })}
          footer={(session, setChoice) => <CustomFormatEditor key={session.choice.id} choice={session.choice} onApply={setChoice} />}
        />
      )}
    >
      <section>
        <h2>How to run a round with it</h2>
        <ol>
          <li>Pick the format. The speech buttons along the top follow the official order, coloured by side.</li>
          <li>Press Start, or the space bar, when the speaker begins. Press it again to pause for a technical problem; the clock keeps the exact remainder.</li>
          <li>Move to the next speech with the arrow button or the right arrow key. Each speech starts from a fresh clock; prep banks carry over.</li>
          <li>Between speeches, tap a side&apos;s prep bank when that side starts preparing, and tap again when they stand up.</li>
          <li>Put the timer on a projector with Fullscreen, so speakers can read the clock from the front of the room.</li>
        </ol>
        <p>Keyboard: space starts and stops, R resets a paused speech, and the left and right arrows change speech. The screen stays awake while a clock runs, where the browser allows it.</p>
      </section>

      <section>
        <h2>What you hear</h2>
        <ul>
          <li><strong>A knock</strong> when points of information open after the first minute and when they close before the last. In BP that matches the 1:00 and 6:00 signals in the WUDC manual.</li>
          <li><strong>One beep</strong> with a minute left in speeches that take no points of information.</li>
          <li><strong>A double beep</strong> at time, and when a prep bank runs out.</li>
        </ul>
        <p>Mute the sound when you would rather signal by hand; the colours still change. The clock turns amber in the last 30 seconds and red once the speaker is over.</p>
      </section>

      <section>
        <h2>Speech times by format</h2>
        <p>These are the times the presets use, taken from each league&apos;s own rules. Tournaments are free to change them, so check the invitation before a competition and adjust with a custom format if yours differs.</p>
        {BUILT_IN_FORMATS.map((format) => <FormatReference key={format.id} format={format} />)}
      </section>

      <section>
        <h2>Timer drills for practice</h2>
        <h3>Thirty seconds short</h3>
        <p>Set a custom format with each speech 30 seconds shorter than the real one and give the same speech. Whatever you had to cut is what you should have weighed less. Do it twice before a tournament and your real speeches end with room for a summary instead of a rush.</p>
        <h3>The protected-minute opener</h3>
        <p>In BP or World Schools, practise saying your roadmap and first argument before the knock at 1:00, when no one can interrupt. Run the PM or first Proposition speech and stop the clock at the knock: if you are still introducing yourself, rewrite the opening.</p>
        <h3>Prep bank budget</h3>
        <p>Public Forum teams get three minutes for the whole round. Before a practice round, agree how you will spend it, for example one minute before summary and two before final focus, and run the bank against that plan. Teams that budget prep stop burning it on the first rebuttal.</p>
        <h3>POI ladder</h3>
        <p>Run a seven-minute BP speech while a partner offers a point of information every time the clock passes a full minute in the open window. Take two and decline the rest politely. The WUDC manual asks each speaker to take at least one, so learn to take it where it suits you.</p>
      </section>

      <section>
        <h2>Embed this timer on your club site</h2>
        <p>Pick a format and paste the snippet into any page that accepts HTML. The embedded timer is the same clock without the page around it, has a small link back here, and loads nothing but its own files: no ads, no tracking, no account.</p>
        <EmbedSnippets />
        <p>For a custom format, set it up above, copy its link, and replace <code>/tools/debate-timer</code> with <code>/embed/debate-timer</code> in the iframe address.</p>
      </section>

      <ToolFaq faq={FAQ} />

      <section>
        <h2>Related guides</h2>
        <ul>
          <li><Link to="/tools/debate-flow-sheet">Print a flow sheet</Link> laid out for the same format, so the timer and the flow match speech for speech.</li>
          <li><a href="/how-to-flow-in-debate">How to flow in debate</a> covers what to write in each column while the clock runs.</li>
          <li><a href="/debate-prep-time-management">Managing prep time</a> goes deeper on spending a prep bank well.</li>
        </ul>
      </section>

      <ToolCta title="Want an opponent to practise against?">
        <p>DebateLab&apos;s sparring rounds put you against an AI opponent in Public Forum, Lincoln-Douglas or the school 4-6-6-3 format, with the speech clock built in, and judge the round when you finish.</p>
      </ToolCta>
    </ToolPageLayout>
  );
}
