import { Link } from 'react-router-dom';
import { FREE_TOOLS, ToolCta, ToolPageLayout } from '@/components/free-tools/ToolPageLayout';
import { PRACTICE_MOTIONS } from '@/lib/free-tools/practice-motions';
import { hubStructuredData } from '@/lib/seo/tool-pages';

export default function ToolsHubPage() {
  return (
    <ToolPageLayout
      route="/tools"
      title="Free debate tools"
      intro={<p>Tools for debate practice that work in any browser and need no account. The timer saves your round in this browser, not on a server. Use them in a club session, on a projector in class, or embedded on your own site.</p>}
      structuredData={hubStructuredData(FREE_TOOLS.map(({ route, name }) => ({ route, name })))}
      tool={(
        <ul className="grid gap-4 sm:grid-cols-2">
          {FREE_TOOLS.map((tool) => (
            <li key={tool.route}>
              <Link
                to={tool.route}
                className="flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <h2 className="text-lg font-semibold text-foreground">{tool.name}</h2>
                <p className="mt-1 text-muted-foreground">{tool.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    >
      <section>
        <h2>What each tool is for</h2>
        <p>The <Link to="/tools/debate-timer">debate timer</Link> runs a whole round: it knows the speech order and times for six league formats and the school 4-6-6-3 format, shows the protected minutes when points of information are not allowed, and keeps a prep bank for each side. Coaches can build their own format and share it as a link.</p>
        <p>The <Link to="/tools/debate-motion-generator">motion generator</Link> draws from {PRACTICE_MOTIONS.length} practice motions written for this site, with &quot;This House&quot; and &quot;Resolved&quot; wording, and lists every one of them by topic.</p>
        <p>The <Link to="/tools/debate-flow-sheet">flow sheet</Link> prints a page with one column per speech for the format you choose, and the <Link to="/tools/speech-time-calculator">speech time calculator</Link> tells you how long a written speech takes to deliver and which slots it fits.</p>
        <p>The four tools share one set of format data, taken from the NSDA, WUDC, WSDC and UADC rules and cited on the timer page, so a Public Forum round has the same speeches on the timer, the flow sheet and the calculator.</p>
      </section>

      <ToolCta title="When you want more than a clock">
        <p>DebateLab is a paid practice app for debaters: it drafts cases for either side of a motion, suggests rebuttals, and runs sparring rounds against an AI opponent.</p>
      </ToolCta>
    </ToolPageLayout>
  );
}
