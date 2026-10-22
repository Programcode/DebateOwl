import { Link } from 'react-router-dom';
import { SpeechTimeCalculator } from '@/components/free-tools/SpeechTimeCalculator';
import { ToolCta, ToolFaq, ToolPageLayout } from '@/components/free-tools/ToolPageLayout';
import { BUILT_IN_FORMATS, formatDuration, segmentRole, speakingSegments } from '@/lib/free-tools/formats';
import { PACES, wordsForSlot } from '@/lib/free-tools/speech-time';
import { toolStructuredData, type FaqEntry } from '@/lib/seo/tool-pages';

const NAME = 'Speech time calculator';

const FAQ: FaqEntry[] = [
  {
    question: 'Is my speech sent anywhere?',
    answer: 'No. The word count and timings are worked out by your browser as you type. The text is never uploaded, stored or seen by anyone else, and it is gone when you close the tab.',
  },
  {
    question: 'How accurate are the timings?',
    answer: 'They are estimates. The 110, 130 and 160 words per minute figures are working approximations for slow, average and fast delivery, not measured norms, and your own rate depends on pauses, emphasis and how much you ad-lib. Time yourself reading a paragraph aloud once and set the custom rate to match.',
  },
  {
    question: 'How do I find my own speaking rate?',
    answer: 'Paste a passage of about 260 words, read it aloud at speech pace while the debate timer runs, and divide the word count by the minutes it took. Enter that number as the custom rate and the calculator will use it for every slot.',
  },
  {
    question: 'Why does it list several formats?',
    answer: 'So you can see at once whether a draft fits the slot you are writing for. Each row is one speech length in one format, such as the 4:00 Public Forum constructive and rebuttal, with the time to spare or the time over at the pace you choose.',
  },
  {
    question: 'Should a written speech fill the whole slot?',
    answer: 'Rarely. Leave room for responses you will add in the round, for points of information in parliamentary formats, and for slowing down on your key line. A workable rule of thumb is to write a prepared speech 10 to 20 percent shorter than the slot.',
  },
];

function TargetTable() {
  const rows = BUILT_IN_FORMATS.flatMap((format) => {
    const lengths = [...new Set(speakingSegments(format).map((segment) => segment.seconds))];
    return lengths.map((seconds) => ({
      key: `${format.id}-${seconds}`,
      format: format.shortName,
      roles: [...new Set(speakingSegments(format).filter((segment) => segment.seconds === seconds).map(segmentRole))].join(' / '),
      seconds,
    }));
  });
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Format</th>
            <th scope="col" className="py-2 pr-3 font-medium">Speech</th>
            <th scope="col" className="py-2 pr-3 font-medium">Time</th>
            {PACES.map((pace) => <th key={pace.id} scope="col" className="py-2 pr-3 font-medium">Words at {pace.wpm} wpm</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/60">
              <td className="py-2 pr-3 font-medium">{row.format}</td>
              <td className="py-2 pr-3">{row.roles}</td>
              <td className="py-2 pr-3 tabular-nums">{formatDuration(row.seconds)}</td>
              {PACES.map((pace) => <td key={pace.id} className="py-2 pr-3 tabular-nums">{wordsForSlot(row.seconds, pace.wpm)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SpeechTimeCalculatorToolPage() {
  return (
    <ToolPageLayout
      route="/tools/speech-time-calculator"
      title="How long is my speech? Speech time calculator"
      intro={<p>Paste a speech to see its word count, how long it takes to deliver at a slow, average or fast pace, and which debate speech slots it fits. Everything runs in your browser; the text never leaves this page.</p>}
      structuredData={toolStructuredData('/tools/speech-time-calculator', NAME, FAQ)}
      tool={<SpeechTimeCalculator />}
    >
      <section>
        <h2>How the calculator works</h2>
        <p>It counts words the way a reader would: &quot;don&apos;t&quot;, &quot;well-known&quot; and &quot;2026&quot; are one word each, and bullets and dashes are not words. It then divides by a speaking rate. Slow is 110 words per minute, average 130 and fast 160; set your own rate in the fourth box.</p>
        <p>These rates are approximations meant for planning, not research figures. Nervous speakers often run faster in a round than in practice, and a speech full of numbers or names takes longer than its word count suggests.</p>
      </section>

      <section>
        <h2>Word targets for common speech slots</h2>
        <p>Writing to a target is easier than cutting afterwards. The table gives the number of words that fills each speech at the three paces, using the same format data as the <Link to="/tools/debate-timer">debate timer</Link>.</p>
        <TargetTable />
      </section>

      <section>
        <h2>Cutting a speech that runs long</h2>
        <ol>
          <li><strong>Cut the throat-clearing first.</strong> Thanks, restating the motion and &quot;I will now move on to&quot; cost seconds and win nothing.</li>
          <li><strong>Merge examples.</strong> One well-explained example beats three listed ones.</li>
          <li><strong>Keep the weighing.</strong> If something has to go, cut description before comparison. Judges decide on why your argument matters more, so that sentence stays.</li>
          <li><strong>Re-time it aloud.</strong> Paste the new draft, then deliver it on the timer. The estimate gets you close; delivery tells you the truth.</li>
        </ol>
      </section>

      <section>
        <h2>A pacing drill</h2>
        <p>Take a 400-word passage. Read it once at your natural pace on the timer, then once aiming for exactly three minutes, then once for two and a half. Speakers who can change pace on purpose can slow down for the line that matters and speed through the summary, which is worth more than any single rate. The <a href="/debate-pronunciation-and-delivery">delivery guide</a> has more drills, and the <a href="/debate-speech-structure">speech structure guide</a> helps decide what each minute is for.</p>
      </section>

      <ToolFaq faq={FAQ} />

      <ToolCta title="Practise the speech out loud with a sparring partner">
        <p>DebateLab&apos;s sparring rounds let you give a timed speech, get an AI opponent&apos;s answer to it, and have the round judged, so you can test a draft against real responses instead of the clock alone.</p>
      </ToolCta>
    </ToolPageLayout>
  );
}
