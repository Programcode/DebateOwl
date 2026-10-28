// Two representative requests per feature, one for each side where the
// feature has sides. Prompt changes are checked against these in
// prompt-examples.test.ts and, with a provider key, by
// scripts/prompt-examples.ts. Keep them small, realistic, and stable.

import type { DebatePromptContext } from "./context.ts";
import type { Feature, PromptSource } from "./common.ts";

export interface PromptExample {
  id: string;
  feature: Feature;
  side: "pro" | "con" | "both";
  input: Record<string, unknown>;
  sources?: PromptSource[];
  debateContext?: DebatePromptContext;
  /** Stand-in for attached web research, in the research module's format. */
  searchContext?: string;
}

const MOTION = "This House would ban homework in primary schools";

const LIBRARY: PromptSource[] = [{
  title: "Education Endowment Foundation toolkit: homework (primary)",
  type: "url",
  origin: "https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/homework",
  content: "The toolkit rates homework in primary schools as low impact for moderate cost, around +2 months of progress on average, with wide variation. Effects are larger when homework is short, linked to classroom learning, and followed by feedback. Evidence for primary pupils is weaker than for secondary pupils.",
}];

function debate(side: "pro" | "con" | "both", outputs: DebatePromptContext["outputs"] = []): DebatePromptContext {
  return {
    motion: MOTION,
    side,
    settings: { format: "4-6-6-3 school format", judge: "Lay judge, a parent volunteer" },
    instructions: "Define homework as work set by teachers to be done at home. Our school counts reading logs as homework. Keep language simple for a lay judge.",
    outputs,
  };
}

const PRO_CASE_DIGEST = "Thesis: Primary homework costs family time and sleep for almost no learning gain.\nArgument 1: Homework adds little for young pupils\n  Explanation: Studies find small or no gains before age 11.\n  Why it matters: Pupils lose rest and play for no benefit.";

const RESEARCH = `=== WEB RESEARCH RESULTS ===

--- From: Homework and achievement, meta-analysis (https://example.edu/cooper-2006) ---
Source quality: academic, strong, 88/100
A synthesis of 32 studies found a positive link between homework and achievement for secondary students, while the link for elementary students was near zero (r = .05). The authors note most studies are correlational.

--- From: National sleep survey 2025 (https://example.gov/sleep-2025) ---
Source quality: government, strong, 82/100
Among children aged 8 to 11, 31% slept less than the recommended 9 hours on school nights. Parents most often named screen time, then homework, as the reason.`;

const PRO_CASE_TEXT = `Our first argument is that homework hurts families. Children come home tired and homework causes fights. Studies show that homework is bad for kids. Secondly, homework is unfair because rich families can help their children more. Therefore the judge must vote in favor, because banning homework will make every child happier and close the achievement gap.`;

const CON_CASE_TEXT = `We oppose the ban. Homework builds independence: children who practise reading at home read better. Teachers need homework to cover the curriculum, since class time is limited. A ban would also remove a key link between parents and school. Some pupils struggle with homework, but the answer is better homework, not no homework.`;

export const PROMPT_EXAMPLES: PromptExample[] = [
  {
    id: "generate-pro-r1",
    feature: "generate",
    side: "pro",
    input: { motion: MOTION, side: "pro", format: "custom", role: "r1", length: "brief", audience: "intermediate", tone: "conversational", language: "en" },
    sources: LIBRARY,
    debateContext: debate("pro", [{ kind: "brainstorm", side: "pro", title: "Homework ideas", digest: "Idea (pro): Rest and play build learning. Children need unstructured time for sleep and play, which support memory." }]),
    searchContext: RESEARCH,
  },
  {
    id: "generate-con-conc",
    feature: "generate",
    side: "con",
    input: { motion: MOTION, side: "con", format: "custom", role: "conc", length: "brief", audience: "beginner", tone: "formal", language: "es" },
    debateContext: debate("con", [{ kind: "case", side: "con", title: "Our R1 case", digest: "Thesis: Short homework builds reading habits a ban would break.\nArgument 1: Reading at home improves literacy\n  Why it matters: Weak readers fall further behind." }]),
    searchContext: RESEARCH,
  },
  {
    id: "attack-pro-case",
    feature: "attack",
    side: "con",
    input: { caseText: PRO_CASE_TEXT, aggressiveness: "moderate", judgeParadigm: "lay", detectFallacies: true, analyzeWeighing: true, language: "en" },
    debateContext: debate("con"),
  },
  {
    id: "attack-con-case",
    feature: "attack",
    side: "pro",
    input: { caseText: CON_CASE_TEXT, aggressiveness: "high", judgeParadigm: "logic", detectFallacies: true, analyzeWeighing: true, language: "en" },
    sources: LIBRARY,
    debateContext: debate("pro", [{ kind: "case", side: "pro", title: "Our case", digest: PRO_CASE_DIGEST }]),
  },
  {
    id: "brainstorm-pro-topfive",
    feature: "brainstorm",
    side: "pro",
    input: { motion: MOTION, side: "pro", outputMode: "topfive", language: "en" },
    debateContext: debate("pro", [{ kind: "brainstorm", side: "pro", title: "Earlier ideas", digest: "Idea (pro): Homework causes family conflict. Evenings become arguments.\nIdea (pro): Homework widens inequality. Richer parents can help more." }]),
  },
  {
    id: "brainstorm-con-buckets",
    feature: "brainstorm",
    side: "con",
    input: { motion: MOTION, side: "con", outputMode: "buckets", language: "hu" },
    debateContext: debate("con"),
  },
  {
    id: "factoids-for",
    feature: "factoids",
    side: "pro",
    input: { claim: "Homework does little for primary school pupils", direction: "for", region: "Global", sourceType: "any", timeframe: "Recent (last 5 years)", sourceCount: 3, language: "en" },
    debateContext: debate("pro"),
    searchContext: RESEARCH,
  },
  {
    id: "factoids-against",
    feature: "factoids",
    side: "con",
    input: { claim: "Homework harms children's sleep", direction: "against", region: "Global", sourceType: "any", timeframe: "Recent (last 5 years)", sourceCount: 3, language: "en" },
    debateContext: debate("con"),
    searchContext: RESEARCH,
  },
  {
    id: "ask-general-pro",
    feature: "ask",
    side: "pro",
    input: { message: "How do I answer 'homework teaches responsibility' in my R2 speech?", mode: "general", language: "en" },
    sources: LIBRARY,
    debateContext: debate("both", [{ kind: "case", side: "pro", title: "Our case", digest: PRO_CASE_DIGEST }]),
  },
  {
    id: "ask-clarify-con",
    feature: "ask",
    side: "con",
    input: { message: "What does 'ban' mean here, and does it include reading logs?", mode: "clarify", language: "en" },
    debateContext: debate("both"),
  },
  {
    id: "crossfire-next-turn-pro",
    feature: "crossfire",
    side: "pro",
    input: {
      operation: "next-turn",
      config: { resolution: MOTION, argument: "Homework in primary school produces almost no learning gain.", mode: "ai-questions-user", style: "aggressive", durationSeconds: 180, useSourceLibrary: false, seedQuestions: [] },
      transcript: [
        { id: "T1", sequence: 1, speaker: "ai", kind: "question", text: "What evidence shows primary homework has no benefit?", createdAt: 1 },
        { id: "T2", sequence: 2, speaker: "user", kind: "answer", text: "Lots of studies say it is basically useless for young kids.", createdAt: 2 },
      ],
      expectedReply: "question",
      language: "en",
    },
    debateContext: debate("both", [{ kind: "factoids", side: "pro", title: "Evidence", digest: "Evidence: Near-zero link between homework and achievement for elementary pupils (r = .05). Source: example.edu" }]),
  },
  {
    id: "crossfire-debrief-con",
    feature: "crossfire",
    side: "con",
    input: {
      operation: "debrief",
      config: { resolution: MOTION, argument: "Short homework builds reading habits.", mode: "question-ai", style: "evasive", durationSeconds: 180, useSourceLibrary: false, seedQuestions: [] },
      transcript: [
        { id: "T1", sequence: 1, speaker: "user", kind: "question", text: "Do you agree some pupils cannot get help at home?", createdAt: 1 },
        { id: "T2", sequence: 2, speaker: "ai", kind: "answer", text: "Schools can run homework clubs for them.", createdAt: 2 },
        { id: "T3", sequence: 3, speaker: "user", kind: "question", text: "So you accept that homework as it is now is unfair?", createdAt: 3 },
        { id: "T4", sequence: 4, speaker: "ai", kind: "answer", text: "I accept that support varies, not that homework is unfair.", createdAt: 4 },
      ],
      language: "en",
    },
    debateContext: debate("both"),
  },
  {
    id: "sparring-respond-pro",
    feature: "sparring",
    side: "pro",
    input: {
      action: "respond",
      sessionId: "11111111-1111-4111-8111-111111111111",
      motion: MOTION,
      userSide: "pro",
      format: "standard",
      difficulty: "medium",
      language: "en",
      currentTurn: { id: "con-intro", side: "con", role: "Introductor", label: "Con Introductor", timeLimitSeconds: 240 },
      speeches: [{ id: "s1", turnId: "pro-intro", speaker: "user", side: "pro", role: "Pro Introductor", content: "Good evening. Imagine a nine-year-old at 9 pm still doing worksheets. We define homework as work set by teachers to be done at home. Our framework is the child's wellbeing. We will show that primary homework brings no learning benefit and costs sleep and family time.", createdAt: 1, timeLimitSeconds: 240, timeUsedSeconds: 60 }],
    },
    debateContext: debate("pro"),
  },
  {
    id: "sparring-score-con",
    feature: "sparring",
    side: "con",
    input: {
      action: "score",
      sessionId: "22222222-2222-4222-8222-222222222222",
      motion: MOTION,
      userSide: "con",
      format: "standard",
      difficulty: "medium",
      language: "en",
      speeches: [
        { id: "s1", turnId: "pro-intro", speaker: "ai", side: "pro", role: "Pro Introductor", content: "Homework steals childhood. We define homework as any task set for home. We will show it harms sleep and adds nothing.", createdAt: 1, timeLimitSeconds: 240, timeUsedSeconds: 50 },
        { id: "s2", turnId: "con-intro", speaker: "user", side: "con", role: "Con Introductor", content: "We oppose the ban. Homework is short practice, not stolen childhood. Our framework is learning for every child. Reading at home is the clearest example: pupils who read ten minutes a night read better. We will show a ban removes that practice and hurts weak readers most.", createdAt: 2, timeLimitSeconds: 240, timeUsedSeconds: 70 },
      ],
    },
    debateContext: debate("con"),
  },
];
