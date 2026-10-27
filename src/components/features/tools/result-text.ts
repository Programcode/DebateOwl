import type { TFunction } from 'i18next';
import type { BrainstormOutput, Idea } from '@/lib/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import { readCase, sourceLine } from '@debatelab/core/ai/case-view';

// Plain-text versions of tool results for the Clipboard button, in what each result view shows.

export function caseText(result: GenerateOutput): string {
  const view = readCase(result);
  const lines: string[] = [];
  const block = (title: string, body: string[]) => {
    if (!body.length) return;
    if (lines.length) lines.push('');
    lines.push(title, ...body);
  };
  block('OPENING:', [
    view.opening.hook,
    view.opening.definition && `What we mean: ${view.opening.definition}`,
    view.opening.roadmap,
    view.legacy.framework && `Framework: ${view.legacy.framework}`,
    view.legacy.burdenOfProof && `Burden of proof: ${view.legacy.burdenOfProof}`,
  ].filter((line): line is string => Boolean(line)).map((line) => `  ${line}`));
  view.arguments.forEach((argument, i) => {
    block(`ARGUMENT ${i + 1}: ${argument.title ?? argument.point}`, [
      argument.title && argument.point && `  Point: ${argument.point}`,
      argument.explanation && `  Explanation: ${argument.explanation}`,
      argument.evidence && `  Evidence: ${argument.evidence}`,
      argument.whyItMatters && `  Why it matters: ${argument.whyItMatters}`,
    ].filter((line): line is string => Boolean(line)));
  });
  block('WHY WE WIN:', view.whyWeWin.map((reason, i) => `  ${i + 1}. ${reason}`));
  block('IF THEY SAY...', view.ifTheySay.map((answer) =>
    `  "${answer.theySay}" -> ${answer.weAnswer}${answer.source ? ` (${answer.source})` : ''}`));
  if (view.closingLine) block('CLOSING LINE:', [`  ${view.closingLine}`]);
  block('SOURCES:', view.sources.map((source) => `  - ${sourceLine(source)}`));
  return lines.join('\n');
}

function ideaLine(idea: Idea, t: TFunction): string[] {
  const lines = [`- ${idea.title || t('brainstormResults.untitled')}: ${idea.description || ''}`];
  if (idea.tradeoffs?.length) lines.push(`  ${t('brainstormResults.tradeoffs')} ${idea.tradeoffs.join(', ')}`);
  return lines;
}

export function brainstormText(result: BrainstormOutput, t: TFunction): string {
  const lines: string[] = [];
  const section = (title: string, body: string[]) => {
    if (body.length === 0) return;
    if (lines.length) lines.push('');
    lines.push(title.toUpperCase(), ...body);
  };
  if (result.needsMoreInfo && result.clarifyingQuestions?.length) {
    section(t('brainstormResults.clarification'), result.clarifyingQuestions.map((question, i) => `${i + 1}. ${question}`));
    return lines.join('\n');
  }
  section(t('brainstormResults.top5'), (result.topFive ?? []).flatMap((item) => [
    `#${item.rank} ${item.idea?.title ?? ''}: ${item.idea?.description ?? ''}`,
    ...(item.whyTop ? [`  ${item.whyTop}`] : []),
  ]));
  for (const category of result.mindmap ?? []) section(category.category, (category.items ?? []).flatMap((idea) => ideaLine(idea, t)));
  for (const bucket of result.buckets ?? []) {
    section(bucket.name, [...(bucket.keyInsight ? [bucket.keyInsight] : []), ...(bucket.ideas ?? []).flatMap((idea) => ideaLine(idea, t))]);
  }
  section(t('brainstormResults.nextSteps'), (result.nextSteps ?? []).map((step, i) => `${i + 1}. ${step}`));
  section(t('brainstormResults.warnings'), (result.warningsAndTradeoffs ?? []).map((warning) => `- ${warning}`));
  return lines.join('\n');
}

/** Only verified evidence, as the result view shows it. */
export function factoidsText(result: FactoidsOutput, t: TFunction): string {
  const factoids = (Array.isArray(result.factoids) ? result.factoids : []).filter((factoid) => factoid.citation?.verified === 'verified');
  return factoids.map((factoid, i) => {
    const citation = factoid.citation;
    const source = [citation?.title, citation?.publisher, citation?.date].filter(Boolean).join(', ');
    return [
      `${i + 1}. ${factoid.shortClaim}`,
      factoid.keyFigure && `  ${t('factoidsResults.keyFigure')} ${factoid.keyFigure}`,
      factoid.context && `  ${t('factoidsResults.context')} ${factoid.context}`,
      factoid.limitations && `  ${t('factoidsResults.limitations')} ${factoid.limitations}`,
      factoid.howToUse && `  ${t('factoidsResults.howToUse')} ${factoid.howToUse}`,
      source && `  ${source}${citation?.url ? ` ${citation.url}` : ''}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}
