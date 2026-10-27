import type { GenerateOutput } from '@/lib/ai/schemas/generate';

// A case in today's shape: an R2 speech with a short opening, one argument,
// "If they say…" answers, a closing line and sources.
export const NEW_CASE: GenerateOutput = {
  opening: { hook: 'Picture a pupil who hides her phone to use AI at night.' },
  caseStructure: { thesis: 'Today we will show 1 argument that proves a ban does more harm than good.' },
  contentions: [{
    id: '1',
    title: 'One size fits all',
    claim: 'A total ban ignores that children grow up.',
    reasoning: 'A ban treats a 7-year-old and a 17-year-old the same.',
    evidence: 'UNICEF said in 2025 that age limits alone do not keep children safe.',
    needsSource: false,
    impact: 'Older pupils lose a learning tool they use responsibly.',
  }],
  counters: [{
    targetArgument: 'AI makes kids cheat.',
    counterpoint: 'Pupils cheated before AI; a ban removes supervision, not cheating.',
    source: 'OECD, 2024',
  }],
  closingLine: 'That is why it is clear that a ban is the wrong answer.',
  sources: [
    { org: 'UNICEF', year: '2025', claim: 'Age limits alone do not keep children safe', url: 'https://www.unicef.org/report' },
    { org: 'Old Wiki', claim: 'A link that must never be followed', url: 'javascript:alert(1)' },
  ],
  metadata: { side: 'con', format: 'custom', generatedAt: '2026-10-27T10:00:00.000Z' },
};

// A case saved before the restructure, with every section it used to have.
export const OLD_CASE: GenerateOutput = {
  exordio: { hook: 'Imagine a city where the bus is free.', transition: 'That city is closer than you think.' },
  caseStructure: {
    thesis: 'Free transit is a net public good.',
    framework: 'Net societal benefit.',
    keyDefinitions: ['Public transport: publicly funded scheduled transit.'],
    burdenOfProof: 'We must show a net gain in practice.',
  },
  contentions: [{
    id: '1',
    claim: 'Fares block the riders who need transit most.',
    reasoning: 'Fares are a regressive barrier.',
    evidence: 'Comparable cities report ridership gains.',
    needsSource: false,
    sourceQuery: '',
    impact: 'More people reach work and school.',
  }],
  predictedOpponentCase: {
    likelyArguments: ['Funding gap', 'Overcrowding'],
    strategicWeaknesses: ['Assumes fares are the only funding model.'],
    keyClashes: ['Who bears the cost.'],
  },
  counters: [{
    targetArgument: 'Funding gap',
    counterpoint: 'Fare collection has heavy overhead.',
    rebuttal: 'Net cost is far below headline farebox revenue.',
  }],
  metadata: { side: 'pro', format: 'custom', generatedAt: '2026-01-06T10:00:00.000Z' },
};
