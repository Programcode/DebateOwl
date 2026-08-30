// src/lib/ai/providers/mock-provider.ts
import type { GenerateInput, GenerateOutput } from '../schemas/generate';
import type { AttackOutput } from '../schemas/attack';
import type { BrainstormOutput } from '../schemas/brainstorm';
import type { FactoidsOutput } from '../schemas/factoids';
import type { AskOutput } from '../schemas/ask';
import type {
  SparringRespondInput,
  SparringScoreInput,
  SparringScoreResponse,
  SparringTurnResponse,
} from '../schemas/sparring';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function mockGenerateCase(
  motion: string,
  side: string,
  length: GenerateInput['length'] = 'standard',
): Promise<GenerateOutput> {
  await delay(1500);
  const actualSide = side === 'auto' ? (Math.random() > 0.5 ? 'pro' : 'con') : side as 'pro' | 'con';
  const contentionCount = length === 'brief' ? 2 : length === 'comprehensive' ? 4 : 3;

  const contentions: GenerateOutput['contentions'] = [
    {
      id: '1',
      claim: 'Economic Impact Analysis',
      reasoning: 'Historical precedent shows that similar policies have led to measurable economic outcomes.',
      evidence: 'Studies from comparable jurisdictions demonstrate consistent patterns.',
      needsSource: true,
      sourceQuery: 'economic impact studies policy implementation',
      impact: 'This directly affects the livelihoods of millions and determines policy viability.',
    },
    {
      id: '2',
      claim: 'Rights-Based Considerations',
      reasoning: 'Fundamental rights must be balanced against collective interests.',
      evidence: 'Constitutional frameworks in democratic nations provide guidance.',
      needsSource: false,
      impact: 'The legitimacy of government action depends on rights protection.',
    },
    {
      id: '3',
      claim: 'Practical Implementation',
      reasoning: 'Policy effectiveness depends on realistic implementation pathways.',
      evidence: 'Case studies from similar implementations inform feasibility.',
      needsSource: true,
      sourceQuery: 'policy implementation case studies success factors',
      impact: 'Without practical viability, the best intentions fail.',
    },
    {
      id: '4',
      claim: 'Long-Term Social Effects',
      reasoning: 'The policy should be assessed against its effects on social cohesion over time.',
      evidence: 'Longitudinal comparisons reveal how similar policies affect communities.',
      needsSource: true,
      sourceQuery: 'long-term social effects policy outcomes',
      impact: 'Durable social outcomes determine whether the policy succeeds beyond its first effects.',
    },
  ];

  return {
    caseStructure: {
      thesis: `We ${actualSide === 'pro' ? 'support' : 'oppose'} the motion: "${motion}" because it fundamentally affects individual rights, economic stability, and social progress.`,
      framework: `This debate should be evaluated through a consequentialist lens, weighing net benefits to society while considering rights-based constraints.`,
      keyDefinitions: [
        'Key terms should be defined according to their commonly understood meanings',
        'Context-specific definitions apply where relevant',
      ],
      burdenOfProof: `The ${actualSide === 'pro' ? 'proposition' : 'opposition'} must demonstrate that the ${actualSide === 'pro' ? 'benefits outweigh costs' : 'status quo is preferable'}.`,
    },
    contentions: contentions.slice(0, contentionCount),
    predictedOpponentCase: {
      likelyArguments: [
        'The opposing side will likely argue about unintended consequences',
        'They may challenge the evidence basis for claims',
        'Economic counterarguments focusing on different metrics',
      ],
      strategicWeaknesses: [
        'Their position may struggle with empirical evidence',
        'Moral arguments may conflict with pragmatic considerations',
      ],
      keyClashes: [
        'Definition of success metrics',
        'Timeframe for evaluation',
        'Stakeholder prioritization',
      ],
    },
    counters: [
      {
        targetArgument: 'Economic harm claims',
        counterpoint: 'Short-term costs must be weighed against long-term benefits',
        rebuttal: 'Studies show that initial disruption leads to net positive outcomes within 3-5 years',
      },
      {
        targetArgument: 'Rights violations',
        counterpoint: 'Reasonable limitations are accepted in all democratic frameworks',
        rebuttal: 'The proportionality test demonstrates this measure meets constitutional standards',
      },
    ],
    metadata: {
      side: actualSide,
      format: 'bp',
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function mockAttackCase(caseText: string): Promise<AttackOutput> {
  await delay(1800);

  return {
    overallAssessment: {
      score: 62,
      summary: 'The case shows promise but has significant gaps in evidence and logical structure that opponents will exploit.',
      strengthAreas: [
        'Clear thesis statement',
        'Good use of framework',
        'Addresses key stakeholders',
      ],
    },
    weaknesses: [
      {
        id: '1',
        severity: 'critical',
        type: 'evidential',
        description: 'Claims lack specific, verifiable evidence',
        whyWeak: 'Without concrete data, assertions become mere opinions that judges can dismiss.',
        howOpponentAttacks: '"My opponent offers no evidence for this claim. We can simply assert the opposite with equal validity."',
        improvedVersion: 'Add specific statistics, studies, or expert testimony with clear citations.',
        affectedQuote: caseText.slice(0, 50) + '...',
      },
      {
        id: '2',
        severity: 'major',
        type: 'logical',
        description: 'Causal chain is incomplete',
        whyWeak: 'The link between premise and conclusion has gaps that undermine persuasiveness.',
        howOpponentAttacks: '"Even if we grant their premise, it doesn\'t follow that their conclusion is true."',
        improvedVersion: 'Explicitly walk through each logical step, explaining why A leads to B leads to C.',
      },
      {
        id: '3',
        severity: 'minor',
        type: 'structural',
        description: 'Weighing mechanism is unclear',
        whyWeak: 'Without clear weighing, judges cannot easily compare your impacts to opponent\'s.',
        howOpponentAttacks: '"They haven\'t told you why their impacts matter more than ours."',
        improvedVersion: 'Add a short weighing paragraph that explains who is affected, how likely the harm is, when it happens, and why that matters more.',
      },
    ],
    fallaciesDetected: [
      {
        name: 'Appeal to Authority',
        location: 'Opening paragraph',
        explanation: 'Citing unnamed "experts" without specifics weakens rather than strengthens.',
      },
      {
        name: 'False Dichotomy',
        location: 'Conclusion',
        explanation: 'Presenting only two options when more nuanced positions exist.',
      },
    ],
    crossExQuestions: [
      {
        question: 'Can you name a specific study that supports your central claim?',
        purpose: 'Expose lack of concrete evidence',
        expectedTrap: 'If they cannot, their entire case loses credibility',
      },
      {
        question: 'How do you weigh the short-term costs against your claimed long-term benefits?',
        purpose: 'Force them to justify their impact calculus',
        expectedTrap: 'Reveals if they have actually thought through the comparison',
      },
      {
        question: 'What would have to be true for your position to be wrong?',
        purpose: 'Test intellectual honesty and identify assumptions',
        expectedTrap: 'Most debaters struggle with this, exposing dogmatic reasoning',
      },
    ],
    weighingAnalysis: {
      currentWeighing: 'The case mentions importance but lacks comparative analysis.',
      missingComparisons: [
        'How many people are affected compared with the opponent\'s claims',
        'How likely the outcomes are to happen in practice',
        'When the impacts happen and how long they last',
      ],
      improvementSuggestions: [
        'Add a dedicated weighing paragraph before conclusion',
        'Use explicit language: "Even if they prove X, our Y still matters more because..."',
        'Quantify where possible: "affects 3x more people" vs "affects many"',
      ],
    },
  };
}

export async function mockBrainstorm(motion: string, outputMode: string): Promise<BrainstormOutput> {
  await delay(1200);

  const ideas = [
    {
      id: '1',
      title: 'Economic Freedom Angle',
      description: 'Focus on how the motion affects market dynamics and individual economic choice.',
      side: 'pro' as const,
      strength: 'strong' as const,
      tradeoffs: ['May alienate values-focused judges', 'Requires economic literacy'],
      relatedTo: ['2', '4'],
    },
    {
      id: '2',
      title: 'Rights-Based Framework',
      description: 'Ground arguments in fundamental human rights and dignity.',
      side: 'neutral' as const,
      strength: 'strong' as const,
      tradeoffs: ['Can be abstract', 'Both sides can claim it'],
      relatedTo: ['1', '3'],
    },
    {
      id: '3',
      title: 'Pragmatic Harm Reduction',
      description: 'Focus on measurable outcomes and real-world impact.',
      side: 'con' as const,
      strength: 'moderate' as const,
      tradeoffs: ['May seem unprincipled', 'Requires strong evidence'],
      relatedTo: ['2'],
    },
    {
      id: '4',
      title: 'Historical Precedent',
      description: 'Draw parallels to similar historical situations.',
      side: 'neutral' as const,
      strength: 'moderate' as const,
      tradeoffs: ['Historical comparisons can be contested', 'May feel dated'],
      relatedTo: ['1'],
    },
    {
      id: '5',
      title: 'Institutional Trust',
      description: 'Examine how the motion affects trust in key institutions.',
      side: 'con' as const,
      strength: 'weak' as const,
      tradeoffs: ['Abstract concept', 'Hard to quantify'],
      relatedTo: [] as string[],
    },
  ];

  return {
    needsMoreInfo: false,
    mindmap: outputMode === 'mindmap' ? [
      { category: 'Economic', items: ideas.filter(i => i.title.includes('Economic')) },
      { category: 'Rights & Values', items: ideas.filter(i => i.title.includes('Rights')) },
      { category: 'Practical', items: ideas.filter(i => i.title.includes('Pragmatic') || i.title.includes('Institutional')) },
      { category: 'Historical', items: ideas.filter(i => i.title.includes('Historical')) },
    ] : undefined,
    buckets: outputMode === 'buckets' ? [
      { name: 'Strong Arguments', ideas: ideas.filter(i => i.strength === 'strong'), keyInsight: 'Build your case around these' },
      { name: 'Supporting Points', ideas: ideas.filter(i => i.strength === 'moderate'), keyInsight: 'Use these to reinforce main arguments' },
      { name: 'Risky Angles', ideas: ideas.filter(i => i.strength === 'weak'), keyInsight: 'Only use if well-researched' },
    ] : undefined,
    topFive: outputMode === 'topfive' ? [
      { rank: 1, idea: ideas[0], whyTop: 'Concrete, measurable, hard to refute' },
      { rank: 2, idea: ideas[1], whyTop: 'Universal appeal, principled stance' },
      { rank: 3, idea: ideas[3], whyTop: 'Provides credibility through precedent' },
      { rank: 4, idea: ideas[2], whyTop: 'Pragmatic judges appreciate this' },
      { rank: 5, idea: ideas[4], whyTop: 'Unique angle opponents may not expect' },
    ] : undefined,
    nextSteps: [
      'Research specific evidence for top 2 angles',
      'Prepare responses to predictable attacks',
      'Test arguments with practice judges',
    ],
    warningsAndTradeoffs: [
      'Avoid combining too many angles, focus wins debates',
      'Economic arguments need current data to be credible',
      'Rights-based framing works best with clear real-world harms',
    ],
  };
}

export async function mockFactoids(claim: string): Promise<FactoidsOutput> {
  await delay(2000);

  return {
    factoids: [
      {
        id: '1',
        shortClaim: 'Global adoption rates have increased significantly',
        keyFigure: '73% increase over 5 years',
        context: 'Based on trends in developed nations; developing nations show different patterns.',
        limitations: 'Data collection methodologies vary by region; may not capture informal adoption.',
        citation: {
          title: 'Global Trends Report 2023',
          publisher: 'International Research Institute',
          date: '2023-06',
          url: undefined,
          verified: 'verified',
        },
        howToUse: 'Use to establish momentum and inevitability of change.',
        relevanceScore: 85,
      },
      {
        id: '2',
        shortClaim: 'Economic impact studies show mixed results',
        keyFigure: '2.3% GDP variance',
        context: 'Varies significantly based on implementation approach and existing infrastructure.',
        limitations: 'Studies often funded by interested parties; control groups difficult.',
        citation: {
          title: 'Economic Policy Analysis',
          publisher: 'University Research Center',
          date: '2022-11',
          verified: 'unverified',
        },
        howToUse: 'Acknowledge complexity while emphasizing favorable outcomes under proper conditions.',
        relevanceScore: 72,
      },
      {
        id: '3',
        shortClaim: 'Public opinion has shifted substantially',
        keyFigure: '58% now support (vs 34% in 2015)',
        context: 'National polls in comparable democracies show consistent trends.',
        limitations: 'Polling methodology affects results; support may not translate to action.',
        citation: {
          title: 'Public Opinion Quarterly Survey',
          publisher: 'National Polling Organization',
          date: '2024-01',
          verified: 'unverified',
        },
        howToUse: 'Demonstrates democratic mandate and social momentum.',
        relevanceScore: 78,
      },
    ],
    searchSuggestions: [
      `${claim} peer reviewed study`,
      `${claim} government report`,
      `${claim} statistical analysis`,
    ],
    warnings: [
      'All sources require verification before use in formal debate',
      'Check for more recent data that may supersede these findings',
      'Consider regional variations in applicability',
    ],
    verificationStatus: 'pending',
  };
}

export async function mockAsk(message: string, mode: string): Promise<AskOutput> {
  await delay(1000);

  const baseResponse: AskOutput = {
    response: `Great question about "${message.slice(0, 50)}..."\n\nIn debate, this topic can be approached from multiple angles. The key is to identify the core value clash and build your case around a clear, defensible principle.`,
    followUpQuestions: [
      'Would you like me to elaborate on any specific aspect?',
      'Should we explore counterarguments to this position?',
      'Do you want help finding evidence for this claim?',
    ],
    uncertainties: [
      'Specific statistics would need verification',
      'Regional variations may apply',
    ],
  };

  if (mode === 'proscons') {
    baseResponse.prosConsAnalysis = {
      pros: [
        'Provides clear framework for evaluation',
        'Addresses core stakeholder concerns',
        'Has precedent in similar contexts',
      ],
      cons: [
        'Implementation challenges exist',
        'May face political opposition',
        'Long-term effects uncertain',
      ],
    };
  }

  if (mode === 'argumentmap') {
    baseResponse.argumentMap = {
      mainClaim: 'The proposition offers net benefits to society',
      supportingPoints: [
        'Evidence from comparable implementations',
        'Theoretical frameworks support this approach',
        'Stakeholder analysis favors action',
      ],
      counterpoints: [
        'Short-term disruption is real',
        'Alternative approaches exist',
        'Uncertainty about long-term effects',
      ],
      assumptions: [
        'Current trends will continue',
        'Implementation will be competent',
        'Resources are available',
      ],
    };
  }

  return baseResponse;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(25, Math.round(score)));
}

/** Deterministic sparring reply for local development and offline UI tests. */
export async function mockGenerateSparringTurn(input: SparringRespondInput): Promise<SparringTurnResponse> {
  const latestSpeech = [...input.speeches].reverse().find((speech) => speech.speaker === 'user');
  const latestPoint = latestSpeech?.content.trim().replace(/\s+/g, ' ').slice(0, 140);
  const difficultyLine = {
    easy: 'I will keep this response focused on the most visible clash.',
    medium: 'I will answer the central claim and press the warrant underneath it.',
    hard: 'I will test the warrant, the link, and the impact comparison before moving on.',
  }[input.difficulty];
  const targetedPoint = latestPoint
    ? `Your latest claim, “${latestPoint}”, needs a clearer link to the motion.`
    : `The ${input.currentTurn.label.toLowerCase()} needs a clear claim, warrant, and impact.`;

  return {
    action: 'respond',
    speech: {
      content: `On ${input.motion}, the ${input.currentTurn.side} side has to explain why its proposed outcome follows in practice. ${targetedPoint} ${difficultyLine}`,
      strategy: input.difficulty === 'hard'
        ? 'Pressure the causal link, then weigh the remaining impact against the motion.'
        : 'Answer the main point directly and keep the comparison tied to the motion.',
      targetedPoints: [targetedPoint],
    },
  };
}

/** Deterministic scorecard for local development. It never depends on time or randomness. */
export async function mockJudgeSparringSession(input: SparringScoreInput): Promise<SparringScoreResponse> {
  const userWords = input.speeches
    .filter((speech) => speech.speaker === 'user')
    .reduce((total, speech) => total + wordCount(speech.content), 0);
  const aiWords = input.speeches
    .filter((speech) => speech.speaker === 'ai')
    .reduce((total, speech) => total + wordCount(speech.content), 0);
  const userTurns = input.speeches.filter((speech) => speech.speaker === 'user').length;
  const aiTurns = input.speeches.filter((speech) => speech.speaker === 'ai').length;
  const difficultyAdjustment = { easy: -2, medium: 0, hard: 2 }[input.difficulty];
  const userDepth = Math.min(10, userWords / 80);
  const aiDepth = Math.min(10, aiWords / 80);
  const userScores = {
    Logic: clampScore(14 + userDepth),
    Evidence: clampScore(11 + userDepth / 2),
    Delivery: clampScore(13 + Math.min(10, userTurns * 2)),
    Strategy: clampScore(12 + userDepth / 2 + (userTurns > 1 ? 2 : 0)),
  };
  const aiScores = {
    Logic: clampScore(14 + aiDepth + difficultyAdjustment),
    Evidence: clampScore(12 + aiDepth / 2 + difficultyAdjustment),
    Delivery: clampScore(14 + Math.min(10, aiTurns * 2) + difficultyAdjustment),
    Strategy: clampScore(13 + aiDepth / 2 + (aiTurns > 1 ? 2 : 0) + difficultyAdjustment),
  };
  const categoryNames = ['Logic', 'Evidence', 'Delivery', 'Strategy'] as const;
  const userScore = categoryNames.reduce((total, name) => total + userScores[name], 0);
  const aiScore = categoryNames.reduce((total, name) => total + aiScores[name], 0);
  const winner = userScore === aiScore ? 'tie' : userScore > aiScore ? 'user' : 'ai';
  const winnerLabel = winner === 'tie' ? 'The round is close.' : `${winner === 'user' ? 'You' : 'The AI'} win the simulated ballot.`;
  const firstUserSpeech = input.speeches.find((speech) => speech.speaker === 'user');

  return {
    action: 'score',
    scorecard: {
      userScore,
      aiScore,
      categories: categoryNames.map((name) => ({
        name,
        userScore: userScores[name],
        aiScore: aiScores[name],
        feedback: name === 'Delivery'
          ? 'Judged from clarity, organization, and time discipline in the transcript, not vocal performance.'
          : `The comparison reflects the ${name.toLowerCase()} visible in the completed speeches.`,
      })),
      overallFeedback: `${winnerLabel} The mock judge compared the completed speeches on the motion “${input.motion}”.`,
      keyMoments: firstUserSpeech
        ? [`Your opening turn established: “${firstUserSpeech.content.trim().replace(/\s+/g, ' ').slice(0, 120)}”`]
        : ['No user speech was submitted, so there was no user argument to weigh.'],
      improvementAreas: [
        'Make each warrant explicit before moving to the impact.',
        'Name the opponent’s strongest point, then explain why your weighing still wins.',
      ],
      winner,
      verdict: winner === 'tie'
        ? 'Close round. The next improvement should target the clearest unresolved clash.'
        : `${winner === 'user' ? 'Your' : 'The AI’s'} side wins on the aggregate category score.`,
    },
  };
}

// Names kept short for callers that treat the mock provider as a feature adapter.
export const mockSparringResponse = mockGenerateSparringTurn;
export const mockSparringScore = mockJudgeSparringSession;
