import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MotionGenerator } from '@/components/free-tools/MotionGenerator';
import { ToolCta, ToolFaq, ToolPageLayout } from '@/components/free-tools/ToolPageLayout';
import { PRACTICE_MOTIONS } from '@/lib/free-tools/practice-motions';
import { MOTION_TOPICS } from '@/lib/free-tools/motion-types';
import { TOPIC_NAMES } from '@/lib/free-tools/motion-bank';
import { toolStructuredData, type FaqEntry } from '@/lib/seo/tool-pages';

const NAME = 'Debate motion generator';

const FAQ: FaqEntry[] = [
  {
    question: 'Where do these motions come from?',
    answer: `All ${PRACTICE_MOTIONS.length} were written for this page as practice material. None is copied from a tournament motion archive, so you can use them in class or club without wondering whether your students have seen the round before.`,
  },
  {
    question: 'What is the difference between THW, THBT and THR?',
    answer: 'This House would (THW) proposes a policy and the Government must show it should happen. This House believes that (THBT) asks whether a statement is true or right. This House regrets (THR) compares the world with something to the world without it. Actor motions ("This House, as a city mayor, would") ask what is best for that actor, not for the world.',
  },
  {
    question: 'Can I get the motions in Resolved form for US formats?',
    answer: 'Yes. Switch the wording to "Resolved" and every motion you draw shows a resolution such as "Resolved: Students should be required to lock their phones in sealed pouches for the whole school day." Each resolution was written by hand rather than converted word by word.',
  },
  {
    question: 'How does the three-motion draw work?',
    answer: 'Draw three draws three different motions from your filters. Use it for a veto drill: each side strikes one motion and you debate the one left, the way some tournaments let teams choose. Drawing again avoids the motions you just saw while enough others remain.',
  },
  {
    question: 'Can I share a motion with my team?',
    answer: 'Every drawn motion has a Copy link button. The link opens this page with that motion on screen, and with the same wording, so a whole squad can prepare the same round from one message.',
  },
  {
    question: 'Are the motions suitable for school students?',
    answer: 'They were written for school and university debaters: no motion asks anyone to defend something cruel, and none targets a religion, ethnicity or living person. Novice motions need no research; advanced ones assume some knowledge of economics, law or politics.',
  },
];

function MotionList() {
  return (
    <section aria-labelledby="bank-heading">
      <h2 id="bank-heading">All {PRACTICE_MOTIONS.length} practice motions by topic</h2>
      <p>Browse the whole bank instead of drawing at random. Each topic runs from novice motions, which work with no preparation, to advanced ones that reward reading around the subject.</p>
      {MOTION_TOPICS.map((topic) => {
        const motions = PRACTICE_MOTIONS.filter((motion) => motion.topic === topic);
        return (
          <section key={topic} aria-labelledby={`topic-${topic}`} className="mt-8">
            <h3 id={`topic-${topic}`}>{TOPIC_NAMES[topic]} ({motions.length})</h3>
            <ul className="!list-none !pl-0 mt-3 divide-y divide-border/60">
              {motions.map((motion) => (
                <li key={motion.id} id={motion.id} className="!mt-0 py-2">
                  <a href={`?m=${motion.id}`} className="!text-foreground !no-underline hover:!underline">{motion.motion}</a>
                  <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">{motion.difficulty}, {motion.type}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

export default function MotionGeneratorToolPage() {
  const { t } = useTranslation('tools');
  const shortAnswer = { question: t('shortAnswer.motions.question'), answer: t('shortAnswer.motions.answer', { total: PRACTICE_MOTIONS.length }) };
  return (
    <ToolPageLayout
      route="/tools/debate-motion-generator"
      title="Debate motion generator"
      intro={<p>Draw a practice motion, or three for a veto drill, from {PRACTICE_MOTIONS.length} original motions across twelve topics. Filter by difficulty and motion type, and switch between &quot;This House&quot; wording for BP and World Schools and &quot;Resolved&quot; wording for US formats.</p>}
      shortAnswer={shortAnswer}
      structuredData={toolStructuredData('/tools/debate-motion-generator', NAME, [shortAnswer, ...FAQ])}
      tool={<MotionGenerator />}
    >
      <section>
        <h2>Using the generator</h2>
        <ol>
          <li>Leave the filters empty to draw from everything, or pick topics, a difficulty and a motion type. You can choose several of each.</li>
          <li>Press Draw one motion for a single round, or Draw three for a motion choice.</li>
          <li>Copy the motion into your round document, or copy its link to send the same motion to your team.</li>
        </ol>
        <p>The filters stay in the page address, so a coach can bookmark &quot;novice education policy motions&quot; and reuse it every week.</p>
      </section>

      <section>
        <h2>Reading a motion before you prep</h2>
        <p>Spend the first minute of prep on the motion itself. Who is the actor, and what are they being asked to do or believe? A policy motion (&quot;This House would make voting compulsory&quot;) puts the burden on the Government to show the change is worth its costs. A value motion (&quot;This House believes that inheritance is unfair&quot;) is won on principle and comparison, not on a mechanism. A regret motion asks you to imagine the world without the thing, and a prefer motion asks you to compare two worlds, both of which have to be described fairly.</p>
        <p>Actor motions are the ones most often misread. &quot;This House, as an environmental group, would use disruptive protests&quot; is not a debate about whether protest is good for society; it is about whether it serves that group&apos;s goals. The <a href="/debate-motion-analysis">motion analysis guide</a> walks through more examples.</p>
      </section>

      <section>
        <h2>Drills that use the generator</h2>
        <h3>Motion choice and veto</h3>
        <p>Draw three motions. Give each team two minutes to rank them privately, then let each side strike one. Debate the motion left over. The drill teaches teams to judge quickly which motions favour them, a skill that matters in any format with a motion choice.</p>
        <h3>Fifteen-minute impromptu</h3>
        <p>Filter to novice or intermediate, draw one motion, and start the <Link to="/tools/debate-timer">debate timer</Link> on a 15-minute custom prep period, the same preparation time British Parliamentary teams get. Speeches follow straight after.</p>
        <h3>Same motion, both sides</h3>
        <p>Draw one advanced motion and have every debater write the best opening for both sides before anyone speaks. If one side feels impossible, you have found the clash: that is where the round will be decided.</p>
        <h3>Wording swap</h3>
        <p>Switch a motion to its Resolved form and compare. &quot;This House regrets the rise of dating apps&quot; and &quot;Resolved: The rise of dating apps has done more harm than good&quot; ask almost the same question, but the second makes the harm-benefit weighing explicit. Debaters moving between US and parliamentary formats should practise reading both.</p>
      </section>

      <MotionList />

      <ToolFaq faq={FAQ} />

      <section>
        <h2>Related guides</h2>
        <ul>
          <li><a href="/debate-topics-for-students">Debate topics for students</a> explains how to pick topics for a class.</li>
          <li><a href="/how-to-write-a-debate-case">How to write a debate case</a> picks up once you have a motion.</li>
          <li><Link to="/tools/speech-time-calculator">The speech time calculator</Link> checks that your first draft fits the speech slot.</li>
        </ul>
      </section>

      <ToolCta title="Prep both sides of a motion in DebateLab">
        <p>Bring any of these motions into DebateLab to generate cases for both sides, brainstorm arguments, and spar against an AI opponent who argues the other side.</p>
      </ToolCta>
    </ToolPageLayout>
  );
}
