import type { AttackOutput } from '../ai/schemas/attack';
import type { GenerateOutput } from '../ai/schemas/generate';
import { readCase } from '../ai/case-view';
import {
  CrossfirePrefillSchema,
  MAX_CROSSFIRE_ARGUMENT_CHARS,
  MAX_CROSSFIRE_SEED_QUESTIONS,
  MAX_CROSSFIRE_TURN_CHARS,
  type CrossfirePrefill,
} from './schemas';

function boundedArgument(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_CROSSFIRE_ARGUMENT_CHARS);
}

export function prefillFromGenerate(resolution: string, result: GenerateOutput): CrossfirePrefill {
  const view = readCase(result);
  const line = (label: string, value: string | undefined) => (value ? `${label}: ${value}` : '');
  const argumentText = view.arguments.map((argument, index) => [
    `Argument ${index + 1}: ${argument.title ? `${argument.title}. ` : ''}${argument.point}`,
    line('Explanation', argument.explanation),
    line('Evidence', argument.evidence),
    line('Why it matters', argument.whyItMatters),
  ].filter(Boolean).join('\n'));

  return CrossfirePrefillSchema.parse({
    source: 'generate',
    resolution: resolution.trim().slice(0, 500),
    argument: boundedArgument([
      line('What we will show', view.opening.roadmap),
      line('How to judge this debate', view.legacy.framework),
      line('What we have to show', view.legacy.burdenOfProof),
      ...argumentText,
      ...view.reinforce.map((item, index) => `Backing up ${item.argument || `argument ${index + 1}`}: ${item.text}`),
      ...view.whyWeWin.map((reason, index) => `Why we win ${index + 1}: ${reason}`),
    ]),
  });
}

export function prefillFromAttack(caseText: string, result: AttackOutput): CrossfirePrefill {
  return CrossfirePrefillSchema.parse({
    source: 'attack',
    argument: caseText.trim().slice(0, MAX_CROSSFIRE_ARGUMENT_CHARS),
    seedQuestions: result.crossExQuestions
      .slice(0, MAX_CROSSFIRE_SEED_QUESTIONS)
      .map((item) => item.question.trim().slice(0, MAX_CROSSFIRE_TURN_CHARS))
      .filter(Boolean),
  });
}
