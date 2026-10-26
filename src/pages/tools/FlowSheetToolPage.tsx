import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FlowSheet } from '@/components/free-tools/FlowSheet';
import { ToolCta, ToolFaq, ToolPageLayout } from '@/components/free-tools/ToolPageLayout';
import { FORMATS, questioningSegments, speakingSegments } from '@/lib/free-tools/formats';
import { toolStructuredData, type FaqEntry } from '@/lib/seo/tool-pages';

const NAME = 'Debate flow sheet generator';

const FAQ: FaqEntry[] = [
  {
    question: 'How do I save the flow sheet as a PDF?',
    answer: 'Press Print and choose "Save as PDF" (or "Microsoft Print to PDF") as the printer. The page sets the paper size and orientation for you, so the sheet fills one page. Turn on background graphics if your browser hides the writing lines.',
  },
  {
    question: 'Why is there one column per speech?',
    answer: 'Flowing means tracking each argument across the round. Writing each speech in its own column, in speaking order, lets you draw a line from an argument to every response to it, and see at a glance what was dropped.',
  },
  {
    question: 'Should I flow on landscape or portrait paper?',
    answer: 'Landscape suits formats with many speeches: Policy has eight columns and Public Forum eight, so each column stays wide enough to write in. Portrait works for Lincoln-Douglas, which has five speeches, or when you flow each side on its own sheet.',
  },
  {
    question: 'What goes in the strip along the bottom?',
    answer: 'For Public Forum, Lincoln-Douglas and Policy, one box per crossfire or cross-examination period, for the answers you want to use later. Parliamentary formats have no questioning periods, so the strip becomes one box for points of information and your decision notes.',
  },
  {
    question: 'Can I write the motion and judge name on the sheet?',
    answer: 'Yes. Anything you type in the motion, round and judge boxes prints in the header. Leave them empty and the sheet prints blank lines to fill in by hand.',
  },
];

export default function FlowSheetToolPage() {
  const { t } = useTranslation('tools');
  const shortAnswer = { question: t('shortAnswer.flow.question'), answer: t('shortAnswer.flow.answer') };
  const pf = FORMATS.pf;
  return (
    <ToolPageLayout
      route="/tools/debate-flow-sheet"
      title="Printable debate flow sheet"
      intro={<p>Pick your format and paper, and print a one-page flow with a column for every speech, labelled by speaker and coloured by side, plus a strip for cross-examination notes. Nothing to install; your browser&apos;s print dialog makes the PDF.</p>}
      shortAnswer={shortAnswer}
      structuredData={toolStructuredData('/tools/debate-flow-sheet', NAME, [shortAnswer, ...FAQ])}
      tool={<FlowSheet />}
    >
      <section>
        <h2>Printing a sheet</h2>
        <ol>
          <li>Choose the format. The columns follow its speaking order, and the header colour of each column shows the side: blue for the side that speaks first, red for the other.</li>
          <li>Pick Letter or A4 and an orientation. Landscape is the default because most formats have more than five speeches.</li>
          <li>Type a motion, round and judge if you want them printed, or leave the lines blank.</li>
          <li>Press Print. Print a stack before a tournament: one sheet per round, plus spares for the elimination rounds.</li>
        </ol>
      </section>

      <section>
        <h2>How to flow a round</h2>
        <p>A flow is a map of the arguments, not a transcript. Write each argument in the column of the speech that made it, in short form, and write each response next to the argument it answers, one column to the right. When a later speech extends or drops an argument, the row shows it.</p>
        <p>In a Public Forum round, the sheet gives you {speakingSegments(pf).length} columns and a box for each of the {questioningSegments(pf).length} crossfires. Flow the first constructive in column one; by the time Team B&apos;s rebuttal starts, column four should line up against Team A&apos;s case row by row. If a row is empty in the summary column, that argument was dropped, and the final focus should say so.</p>
        <p>The <a href="/how-to-flow-in-debate">full flowing guide</a> covers symbols, colour coding and how to flow fast speakers. After the round, the <a href="/argument-flowchart">argument flowchart guide</a> shows how to redraw a flow as a map of claims, links and weighing.</p>
      </section>

      <section>
        <h2>Habits that make a flow useful</h2>
        <ul>
          <li><strong>Abbreviate consistently.</strong> Pick symbols and keep them: an up arrow for increase, a delta for change, a circled X for a dropped argument, and &quot;T/&quot; for a turn.</li>
          <li><strong>Leave space.</strong> Start each new argument lower than you think you need to, so the responses have room beside it.</li>
          <li><strong>Number the arguments.</strong> &quot;Their 2&quot; is faster to write and to say in a speech than a summary of the argument.</li>
          <li><strong>Write the cross-examination answers you will use</strong> in the bottom strip, with the speech they belong to, so you can quote them in the next speech.</li>
          <li><strong>Flow your own side too.</strong> Your partner&apos;s speech is part of the map; you cannot extend what you did not write down.</li>
        </ul>
      </section>

      <section>
        <h2>A flow drill</h2>
        <p>Run a speech on the <Link to="/tools/debate-timer">debate timer</Link> while two teammates flow it on printed sheets. Afterwards, compare the two flows with the speaker&apos;s notes. Every argument the speaker made but a flower missed is either a flowing problem or a signposting problem, and the speaker usually learns as much as the flowers do.</p>
      </section>

      <ToolFaq faq={FAQ} />

      <ToolCta title="Map a round on screen">
        <p>DebateLab&apos;s argument flowchart lets you lay out claims and responses as a diagram you can edit and export, next to AI tools that draft cases and rebuttals for either side.</p>
      </ToolCta>
    </ToolPageLayout>
  );
}
