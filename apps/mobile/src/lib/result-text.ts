import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A case as plain text, line for line as the website's Clipboard button copies it (GenerateResults). */
export function caseToText(result: GenerateOutput): string {
  const lines: string[] = [];
  lines.push(`THESIS: ${result.caseStructure?.thesis || ''}`);
  lines.push(`FRAMEWORK: ${result.caseStructure?.framework || ''}`);
  lines.push('');
  result.contentions?.forEach((c, i) => {
    lines.push(`CONTENTION #${i + 1}: ${c.claim}`);
    lines.push(`  Reasoning: ${c.reasoning}`);
    lines.push(`  Evidence: ${c.evidence}`);
    lines.push(`  Impact: ${c.impact}`);
    lines.push('');
  });
  if (result.counters?.length) {
    lines.push('PREPARED COUNTERS:');
    result.counters.forEach((c) => {
      lines.push(`  vs "${c.targetArgument}": ${c.counterpoint}`);
    });
  }
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
    ${result.contentions.map((c, i) => `${i + 1}. ${c.claim}`).join('\n')}

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
