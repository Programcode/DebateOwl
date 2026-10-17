// Maps each tool's partially written answer to the sections a live draft
// shows. The labels are the ones the finished results use, so the draft
// reads like the result filling in. Anything not written yet is left out.
import type { TFunction } from 'i18next';

export interface DraftBlock {
  /** A bold first line, such as a contention's claim. */
  heading?: string;
  label?: string;
  text?: string;
  items?: string[];
}

export interface DraftSection {
  id: string;
  title: string;
  blocks: DraftBlock[];
}

type Draft = Record<string, unknown>;

function record(value: unknown): Draft {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Draft : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function strings(value: unknown): string[] {
  return list(value).flatMap((item): string[] => { const entry = text(item); return entry ? [entry] : []; });
}

function block(label: string | undefined, value: unknown): DraftBlock[] {
  const content = text(value);
  return content ? [{ label, text: content }] : [];
}

function itemsBlock(label: string | undefined, value: unknown): DraftBlock[] {
  const items = strings(value);
  return items.length ? [{ label, items }] : [];
}

function heading(value: unknown): DraftBlock[] {
  const content = text(value);
  return content ? [{ heading: content }] : [];
}

function section(id: string, title: string, blocks: DraftBlock[]): DraftSection[] {
  return blocks.length ? [{ id, title, blocks }] : [];
}

export function generateDraftSections(draft: Draft, t: TFunction): DraftSection[] {
  const exordio = record(draft.exordio);
  const structure = record(draft.caseStructure);
  const opponent = record(draft.predictedOpponentCase);
  return [
    ...section('exordio', t('generateResults.exordio'), [
      ...block(t('generateResults.hook'), exordio.hook),
      ...block(t('generateResults.transition'), exordio.transition),
    ]),
    ...section('structure', t('generateResults.caseStructure'), [
      ...block(t('generateResults.thesis'), structure.thesis),
      ...block(t('generateResults.framework'), structure.framework),
      ...itemsBlock(t('generateResults.keyDefinitions'), structure.keyDefinitions),
      ...block(t('generateResults.burdenOfProof'), structure.burdenOfProof),
    ]),
    ...section('contentions', t('generateResults.structuredArguments'), list(draft.contentions).flatMap((value) => {
      const contention = record(value);
      return [
        ...heading(contention.claim),
        ...block(t('generateResults.reasoning'), contention.reasoning),
        ...block(t('generateResults.evidence'), contention.evidence),
        ...block(t('generateResults.impact'), contention.impact),
      ];
    })),
    ...section('opponent', t('generateResults.predictedOpponent'), [
      ...itemsBlock(t('generateResults.likelyArguments'), opponent.likelyArguments),
      ...itemsBlock(t('generateResults.strategicWeaknesses'), opponent.strategicWeaknesses),
      ...itemsBlock(t('generateResults.keyClashes'), opponent.keyClashes),
    ]),
    ...section('counters', t('generateResults.preparedCounters'), list(draft.counters).flatMap((value) => {
      const counter = record(value);
      return [
        ...heading(counter.targetArgument),
        ...block(t('generateResults.counter'), counter.counterpoint),
        ...block(t('generateResults.rebuttal'), counter.rebuttal),
      ];
    })),
  ];
}

export function attackDraftSections(draft: Draft, t: TFunction): DraftSection[] {
  const overall = record(draft.overallAssessment);
  const weighing = record(draft.weighingAnalysis);
  const score = text(overall.score);
  return [
    ...section('overall', t('attackResults.overall'), [
      ...block(t('attackResults.caseStrength'), score ? `${score}/100` : undefined),
      ...block(undefined, overall.summary),
      ...itemsBlock(t('attackResults.strengths'), overall.strengthAreas),
    ]),
    ...section('weaknesses', t('attackResults.weaknesses'), list(draft.weaknesses).flatMap((value) => {
      const weakness = record(value);
      return [
        ...heading(weakness.description),
        ...block(t('attackResults.whyWeak'), weakness.whyWeak),
        ...block(t('attackResults.opponentAttack'), weakness.howOpponentAttacks),
        ...block(t('attackResults.improvedVersion'), weakness.improvedVersion),
      ];
    })),
    ...section('fallacies', t('attackResults.fallacies'), list(draft.fallaciesDetected).flatMap((value) => {
      const fallacy = record(value);
      return [...heading(fallacy.name), ...block(undefined, fallacy.explanation)];
    })),
    ...section('crossEx', t('attackResults.crossEx'), list(draft.crossExQuestions).flatMap((value) => {
      const question = record(value);
      return [
        ...heading(question.question),
        ...block(t('attackResults.purpose'), question.purpose),
        ...block(t('attackResults.expectedTrap'), question.expectedTrap),
      ];
    })),
    ...section('weighing', t('attackResults.weighing'), [
      ...block(t('attackResults.currentWeighing'), weighing.currentWeighing),
      ...itemsBlock(t('attackResults.missingComparisons'), weighing.missingComparisons),
      ...itemsBlock(t('attackResults.improvements'), weighing.improvementSuggestions),
    ]),
  ];
}

function ideaBlocks(value: unknown): DraftBlock[] {
  const idea = record(value);
  return [...heading(idea.title), ...block(undefined, idea.description)];
}

export function brainstormDraftSections(draft: Draft, t: TFunction): DraftSection[] {
  return [
    ...section('clarification', t('brainstormResults.clarification'), itemsBlock(undefined, draft.clarifyingQuestions)),
    ...list(draft.mindmap).flatMap((value, index) => {
      const branch = record(value);
      return section(`mindmap-${index}`, text(branch.category) ?? t('brainstormResults.argMap'), list(branch.items).flatMap(ideaBlocks));
    }),
    ...list(draft.buckets).flatMap((value, index) => {
      const bucket = record(value);
      return section(`bucket-${index}`, text(bucket.name) ?? t('brainstormResults.argMap'), [
        ...block(undefined, bucket.keyInsight),
        ...list(bucket.ideas).flatMap(ideaBlocks),
      ]);
    }),
    ...section('topFive', t('brainstormResults.argMap'), list(draft.topFive).flatMap((value) => {
      const entry = record(value);
      return [...ideaBlocks(entry.idea), ...block(undefined, entry.whyTop)];
    })),
    ...section('nextSteps', t('brainstormResults.nextSteps'), itemsBlock(undefined, draft.nextSteps)),
    ...section('warnings', t('brainstormResults.warnings'), itemsBlock(undefined, draft.warningsAndTradeoffs)),
  ];
}

export function factoidsDraftSections(draft: Draft, t: TFunction): DraftSection[] {
  return [
    ...section('factoids', t('factoidsResults.factoids'), list(draft.factoids).flatMap((value) => {
      const factoid = record(value);
      return [
        ...heading(factoid.shortClaim),
        ...block(t('factoidsResults.keyFigure'), factoid.keyFigure),
        ...block(t('factoidsResults.context'), factoid.context),
        ...block(t('factoidsResults.limitations'), factoid.limitations),
        ...block(t('factoidsResults.howToUse'), factoid.howToUse),
      ];
    })),
    ...section('findMore', t('factoidsResults.findMore'), itemsBlock(undefined, draft.searchSuggestions)),
    ...section('notes', t('factoidsResults.importantNotes'), itemsBlock(undefined, draft.warnings)),
  ];
}

function claims(value: unknown): string[] {
  return list(value).flatMap((item): string[] => { const claim = text(record(item).claim); return claim ? [claim] : []; });
}

export function crossfireDebriefDraftSections(draft: Draft, t: TFunction): DraftSection[] {
  const categories = [
    'concessionsSecured',
    'controlledQuestions',
    'weakOrRepetitiveQuestions',
    'evasiveOrIncompleteAnswers',
    'missedFollowUps',
  ] as const;
  return [
    ...categories.flatMap((key) => section(key, t(`crossfire.${key}`), itemsBlock(undefined, claims(draft[key])))),
    ...section('betterFollowUpQuestions', t('crossfire.betterFollowUpQuestions'), list(draft.betterFollowUpQuestions).flatMap((value) => {
      const item = record(value);
      return [...heading(item.question), ...block(undefined, item.reason)];
    })),
    ...section('strongestExchange', t('crossfire.strongestExchange'), block(undefined, record(draft.strongestExchange).claim)),
  ];
}

export function sparringScoreDraftSections(draft: Draft, t: TFunction): DraftSection[] {
  const scorecard = record(draft.scorecard);
  return [
    ...section('overall', t('sparring.scorecard.overallFeedback', 'Overall feedback'), block(undefined, scorecard.overallFeedback)),
    ...section('categories', t('sparring.scorecard.categoryNotes', 'Category notes'), list(scorecard.categories).flatMap((value) => {
      const category = record(value);
      const name = text(category.name);
      return [
        ...heading(name ? t(`sparring.category.${name}`, name) : undefined),
        ...block(undefined, category.feedback),
      ];
    })),
    ...section('keyMoments', t('sparring.scorecard.keyMoments', 'Key moments'), itemsBlock(undefined, scorecard.keyMoments ?? draft.keyMoments)),
    ...section('workOnNext', t('sparring.scorecard.workOnNext', 'Work on next'), itemsBlock(undefined, scorecard.improvementAreas ?? draft.improvementAreas)),
    ...section('verdict', t('sparring.scorecard.verdict', "Judge's verdict"), block(undefined, scorecard.verdict ?? draft.verdict)),
  ];
}
