import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import type { BrainstormOutput } from '@debatelab/core/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import { readCase, sourceLine } from '@debatelab/core/ai/case-view';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A case as plain text, line for line as the website's Clipboard button copies it (GenerateResults). */
export function caseToText(result: GenerateOutput): string {
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
    view.legacy.framework && `How to judge this debate: ${view.legacy.framework}`,
    view.legacy.burdenOfProof && `What we have to show: ${view.legacy.burdenOfProof}`,
  ].filter((line): line is string => Boolean(line)).map((line) => `  ${line}`));
  view.arguments.forEach((argument, i) => {
    block(`ARGUMENT ${i + 1}: ${argument.title ?? argument.point}`, [
      argument.title && argument.point && `  Point: ${argument.point}`,
      argument.explanation && `  Explanation: ${argument.explanation}`,
      argument.evidence && `  Evidence: ${argument.evidence}`,
      argument.whyItMatters && `  Why it matters: ${argument.whyItMatters}`,
    ].filter((line): line is string => Boolean(line)));
  });
  view.reinforce.forEach((item, i) => block(`BACKING UP ${item.argument || `ARGUMENT ${i + 1}`}:`, [`  ${item.text}`]));
  block('WHY WE WIN:', view.whyWeWin.map((reason, i) => `  ${i + 1}. ${reason}`));
  block('IF THEY SAY...', view.ifTheySay.map((answer) =>
    `  "${answer.theySay}" -> ${answer.weAnswer}${answer.inRound ? ` ${answer.inRound}` : ''}${answer.source ? ` (${answer.source})` : ''}`));
  if (view.closingLine) block('CLOSING LINE:', [`  ${view.closingLine}`]);
  block('SOURCES:', view.sources.map((source) => `  - ${sourceLine(source)}`));
  return lines.join('\n');
}

/**
 * An attack analysis as plain text. The website has no clipboard button for
 * attacks, so this follows its Word export's sections and labels.
 */
export function attackToText(result: AttackOutput, t: Translate): string {
  const lines: string[] = [t('export.caseAttack'), ''];
  lines.push(`${t('export.overallScore')}: ${result.overallAssessment.score}/100`);
  if (result.overallAssessment.summary) lines.push(result.overallAssessment.summary);
  if (result.overallAssessment.strengthAreas?.length) {
    lines.push('', `${t('export.strengthAreas')}:`);
    result.overallAssessment.strengthAreas.forEach((item) => lines.push(`  - ${item}`));
  }
  lines.push('', `${t('export.weaknesses').toUpperCase()}:`);
  if (result.weaknesses.length === 0) lines.push(`  ${t('export.noWeaknesses')}`);
  result.weaknesses.forEach((w, i) => {
    lines.push(`${i + 1}. [${w.severity?.toUpperCase()}] ${w.description}`);
    lines.push(`  ${t('export.whyWeak')}: ${w.whyWeak || ''}`);
    lines.push(`  ${t('export.howOpponentAttacks')}: ${w.howOpponentAttacks || ''}`);
    lines.push(`  ${t('export.improvedVersion')}: ${w.improvedVersion || ''}`);
  });
  lines.push('', `${t('export.fallacies').toUpperCase()}:`);
  if ((result.fallaciesDetected ?? []).length === 0) lines.push(`  ${t('export.noFallacies')}`);
  (result.fallaciesDetected ?? []).forEach((f) => {
    lines.push(`${f.name} (${t('export.location')}: ${f.location})`);
    lines.push(`  ${f.explanation}`);
  });
  lines.push('', `${t('export.crossExQuestions').toUpperCase()}:`);
  if ((result.crossExQuestions ?? []).length === 0) lines.push(`  ${t('export.noCrossEx')}`);
  (result.crossExQuestions ?? []).forEach((q, i) => {
    lines.push(`Q${i + 1}: ${q.question}`);
    lines.push(`  ${t('export.purpose')}: ${q.purpose}`);
    lines.push(`  ${t('export.expectedTrap')}: ${q.expectedTrap}`);
  });
  if (result.weighingAnalysis) {
    lines.push('', `${t('export.weighingAnalysis').toUpperCase()}:`);
    lines.push(result.weighingAnalysis.currentWeighing || t('export.noWeighingAnalysis'));
    (result.weighingAnalysis.missingComparisons ?? []).forEach((item) => lines.push(`  - ${item}`));
    (result.weighingAnalysis.improvementSuggestions ?? []).forEach((item) => lines.push(`  → ${item}`));
  }
  return lines.join('\n');
}

/** The message the website's Discuss button sends to Ask for a case (GeneratePage). */
export function discussCaseMessage(result: GenerateOutput): string {
  return `I'd like to discuss the case we just generated.

    **Thesis:** ${result.caseStructure.thesis}

    **Arguments:**
    ${(result.contentions.length
      ? result.contentions.map((c, i) => `${i + 1}. ${c.title ?? c.claim}`)
      : result.reinforce?.length
        ? result.reinforce.map((item, i) => `${i + 1}. ${item.argument || item.text}`)
        : (result.whyWeWin ?? []).map((reason, i) => `${i + 1}. ${reason}`)).join('\n')}

    Can we refine this?`;
}

/** The message the website's Discuss button sends to Ask for an attack (AttackPage). */
export function discussAttackMessage(result: AttackOutput): string {
  return `I'd like to discuss the critique of my case.

    **Overall Assessment:** ${result.overallAssessment.summary}
    **Score:** ${result.overallAssessment.score}/100

    **Top Weaknesses:**
    ${result.weaknesses.slice(0, 3).map((w) => `- ${w.description} (${w.severity})`).join('\n')}

    Can you help me improve this?`;
}

/**
 * A brainstorm as plain text. The website has no clipboard button for
 * brainstorms, so this follows its Word export's sections (exportBrainstormToDocx),
 * with the PDF export's translated headings where the Word export has English ones.
 */
export function brainstormToText(result: BrainstormOutput, t: Translate): string {
  const lines: string[] = [t('export.brainstormResults')];
  const topFive = result.topFive ?? [];
  if (topFive.length > 0) {
    lines.push('', t('export.topArgumentAngles').toUpperCase());
    topFive.forEach((item) => {
      lines.push('', `#${item.rank}: ${item.idea?.title || t('brainstormResults.untitled')}`);
      lines.push(item.idea?.description || '');
      lines.push(`${t('export.whyTop')}: ${item.whyTop || ''}`);
    });
  }
  const mindmap = result.mindmap ?? [];
  if (mindmap.length > 0) {
    lines.push('', t('export.argumentCategories').toUpperCase());
    mindmap.forEach((category) => {
      lines.push('', category.category);
      (category.items ?? []).forEach((idea) => lines.push(`• ${idea.title}: ${idea.description}`));
    });
  }
  const buckets = result.buckets ?? [];
  if (buckets.length > 0) {
    lines.push('', t('export.strategicBuckets').toUpperCase());
    buckets.forEach((bucket) => {
      lines.push('', bucket.name);
      lines.push(bucket.keyInsight || '');
      (bucket.ideas ?? []).forEach((idea) => lines.push(`• ${idea.title}`));
    });
  }
  const nextSteps = result.nextSteps ?? [];
  if (nextSteps.length > 0) {
    lines.push('', t('export.recommendedNextSteps').toUpperCase());
    nextSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  return lines.join('\n');
}

/**
 * Factoids as plain text, following the website's Word export
 * (exportFactoidsToDocx) as attackToText does for attacks.
 */
export function factoidsToText(result: FactoidsOutput, t: Translate): string {
  const lines: string[] = [t('export.researchFactoids'), '', t('export.keyFactsAndEvidence').toUpperCase()];
  const factoids = result.factoids ?? [];
  if (factoids.length === 0) lines.push(t('export.noFactoids'));
  factoids.forEach((f, i) => {
    lines.push('', `${i + 1}. ${f.shortClaim}`);
    lines.push(`${t('export.keyFigure')}: ${f.keyFigure || ''}`);
    lines.push(`${t('export.context')}: ${f.context || ''}`);
    lines.push(`${t('export.howToUse')}: ${f.howToUse || ''}`);
    lines.push(`${t('export.source')}: ${f.citation?.title || t('export.unknown')} - ${f.citation?.publisher || t('export.unknown')}`);
  });
  const warnings = result.warnings ?? [];
  if (warnings.length > 0) {
    lines.push('', t('export.warnings').toUpperCase());
    warnings.forEach((warning) => lines.push(`⚠ ${warning}`));
  }
  return lines.join('\n');
}

/** The message the website's Discuss button sends to Ask for a brainstorm (BrainstormPage). */
export function discussBrainstormMessage(result: BrainstormOutput, t: Translate): string {
  let summary = "I'd like to discuss these brainstormed ideas.\n\n";
  if (result.topFive) {
    summary += '**Top Ideas:**\n' + result.topFive.map((i) => {
      const side = i.idea.side ? t(`brainstormResults.${i.idea.side}`, { defaultValue: i.idea.side }) : 'N/A';
      return `- ${i.idea.title} (${side})`;
    }).join('\n');
  } else if (result.buckets) {
    summary += '**Key Buckets:**\n' + result.buckets.map((b) => `- ${b.name}: ${b.keyInsight}`).join('\n');
  }
  summary += '\n\nCan you help me expand on one of these?';
  return summary;
}

/** The message the website's Discuss button sends to Ask for factoids (FactoidsPage). */
export function discussFactoidsMessage(result: FactoidsOutput): string {
  return `I'd like to discuss the evidence I found.
    
    **Factoids:**
    ${result.factoids.slice(0, 3).map((f) => `- ${f.shortClaim} (${f.citation.publisher})`).join('\n')}
    
    How can I best use this evidence?`;
}
