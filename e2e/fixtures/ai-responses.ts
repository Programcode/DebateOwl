/**
 * Canned edge-function responses for specs that exercise UI states rather than
 * AI quality. Intercepting the network keeps the app's real request path — and
 * its schema validation — under test, unlike the deleted in-app mock provider
 * which bypassed both.
 */
import type { Page } from '@playwright/test';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json',
};

// The client rejects a generate response whose contention count does not match
// the requested length (see expectedContentionCount in src/lib/ai/features/generate.ts).
const CONTENTION_COUNT: Record<string, number> = { brief: 2, standard: 3, comprehensive: 4 };

const CONTENTIONS = [
  {
    id: '1',
    claim: 'Access improves for the people who need it most',
    reasoning: 'Fares are a regressive barrier concentrated on low-income riders.',
    evidence: 'Comparable jurisdictions report ridership gains after fare removal.',
    needsSource: false,
    impact: 'More people reach work, school, and healthcare.',
  },
  {
    id: '2',
    claim: 'Congestion and emissions fall as mode share shifts',
    reasoning: 'Removing the marginal cost of a trip shifts journeys off the road.',
    evidence: 'Mode-share studies show measurable shifts at zero fare.',
    needsSource: false,
    impact: 'Shorter journeys and lower urban emissions.',
  },
  {
    id: '3',
    claim: 'Fare collection overhead outweighs much of the revenue it protects',
    reasoning: 'Gates, inspectors, and ticketing systems consume a large share of receipts.',
    evidence: 'Operators report collection costs well above headline estimates.',
    needsSource: false,
    impact: 'The net funding gap is far smaller than opponents claim.',
  },
  {
    id: '4',
    claim: 'Civic participation rises when mobility is not rationed by price',
    reasoning: 'Unpriced trips are taken for non-essential civic and social reasons too.',
    evidence: 'Ridership growth after fare removal skews to off-peak trips.',
    needsSource: false,
    impact: 'Denser civic life, not just cheaper commutes.',
  },
];

const generate = (motion: string, length: string) => ({
  caseStructure: {
    thesis: `We support the motion that ${motion}`,
    framework: 'Net societal benefit, weighed on access and cost.',
    keyDefinitions: ['Public transport: publicly funded scheduled transit.'],
    burdenOfProof: 'We must show the policy produces a net gain in practice.',
  },
  contentions: CONTENTIONS.slice(0, CONTENTION_COUNT[length] ?? 2),
  predictedOpponentCase: {
    likelyArguments: ['The lost farebox revenue has to come from somewhere.'],
    strategicWeaknesses: ['Assumes fare revenue is the only funding model.'],
    keyClashes: ['Who actually bears the cost.'],
  },
  counters: [
    {
      targetArgument: 'Funding gap',
      counterpoint: 'Fare collection itself carries substantial overhead.',
      rebuttal: 'Net cost is far below headline farebox revenue.',
    },
  ],
  metadata: { side: 'pro', format: 'bp', generatedAt: new Date().toISOString() },
});

const attack = {
  overallAssessment: {
    score: 62,
    summary: 'The case is coherent but leaves its central warrant underdefended.',
    strengthAreas: ['Clear thesis', 'Explicit framework'],
  },
  weaknesses: [
    {
      id: 'w1',
      severity: 'major',
      type: 'evidential',
      description: 'The congestion claim has no comparative evidence.',
      whyWeak: 'Correlation between fare policy and congestion is asserted, not shown.',
      howOpponentAttacks: 'Name a city where ridership rose and congestion did not fall.',
      improvedVersion: 'Cite a before/after study with a control corridor.',
    },
  ],
  fallaciesDetected: [
    { name: 'Hasty generalization', location: 'Second contention', explanation: 'One city generalized to all.' },
  ],
  crossExQuestions: [
    { question: 'Which funding line replaces the farebox?', purpose: 'Force a concrete mechanism.', expectedTrap: 'A vague appeal to general taxation.' },
  ],
  weighingAnalysis: {
    currentWeighing: 'Access is asserted to outweigh cost without comparison.',
    missingComparisons: ['Cost per additional rider versus targeted subsidy.'],
    improvementSuggestions: ['Weigh against the strongest alternative, not the status quo.'],
  },
};

const idea = {
  id: 'i1',
  title: 'Access as a precondition for participation',
  description: 'Mobility gates work, education, and civic life.',
  side: 'pro',
  strength: 'strong',
  tradeoffs: ['Requires a durable funding source.'],
  relatedTo: [],
};

const brainstorm = {
  needsMoreInfo: false,
  topFive: [{ rank: 1, idea, whyTop: 'It reaches the widest impact with the clearest warrant.' }],
  nextSteps: ['Find a before/after ridership study.'],
  warningsAndTradeoffs: ['Do not overclaim the congestion effect.'],
};

const factoids = {
  factoids: [
    {
      id: 'f1',
      shortClaim: 'Fare removal raised ridership in Tallinn',
      keyFigure: '+14% ridership',
      context: 'Measured over the first year of the free-fare scheme.',
      limitations: 'A single city with unusual baseline car ownership.',
      citation: { title: 'Free public transport evaluation', publisher: 'Municipal transport authority', verified: 'verified' },
      howToUse: 'Use as an existence proof, not as a universal rate.',
      relevanceScore: 80,
    },
  ],
  searchSuggestions: ['fare-free transit ridership study'],
  warnings: [],
  verificationStatus: 'complete',
};

const ask = (message: string) => ({
  response: `Great question about ${message.slice(0, 60)} — weigh access against cost by naming who bears each.`,
  followUpQuestions: ['What is the strongest alternative policy?'],
  uncertainties: ['The congestion effect size varies widely by city.'],
});

type AiRequest = { feature?: string; input?: Record<string, unknown> };

// The deleted mock provider delayed 1-2s per feature, which is what made the
// loading states observable. Specs assert on those states, so keep the latency.
const RESPONSE_DELAY_MS = 1_200;

/**
 * Serves canned output for every `ai` edge-function call. Specs that need a
 * specific payload should add their own narrower `page.route` first.
 */
export async function stubAIResponses(page: Page) {
  await page.route('**/functions/v1/ai**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: CORS_HEADERS, body: 'ok' });
      return;
    }
    const body = (route.request().postDataJSON() ?? {}) as AiRequest;
    const motion = typeof body.input?.motion === 'string' ? body.input.motion : 'the motion';
    const message = typeof body.input?.message === 'string' ? body.input.message : 'this';
    const length = typeof body.input?.length === 'string' ? body.input.length : 'brief';
    const output = {
      generate: () => generate(motion, length),
      attack: () => attack,
      brainstorm: () => brainstorm,
      factoids: () => factoids,
      ask: () => ask(message),
    }[body.feature ?? '']?.();

    if (!output) {
      await route.fulfill({ status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `No fixture for feature ${body.feature}` }) });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ output, discoveredSources: [] }) });
  });
}
