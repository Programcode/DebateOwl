import type { AttackOutput } from '../ai/schemas/attack';
import type { GenerateOutput } from '../ai/schemas/generate';
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
  const contentionText = result.contentions.map((contention, index) => [
    `Contention ${index + 1}: ${contention.claim}`,
    `Reasoning: ${contention.reasoning}`,
    `Evidence: ${contention.evidence}`,
    `Impact: ${contention.impact}`,
  ].join('\n'));

  return CrossfirePrefillSchema.parse({
    source: 'generate',
    resolution: resolution.trim().slice(0, 500),
    argument: boundedArgument([
      `Thesis: ${result.caseStructure.thesis}`,
      `Framework: ${result.caseStructure.framework}`,
      `Burden of proof: ${result.caseStructure.burdenOfProof}`,
      ...contentionText,
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
