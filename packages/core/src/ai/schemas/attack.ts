// packages/core/src/ai/schemas/attack.ts
import { z } from 'zod';

export const AttackInputSchema = z.object({
  // A catalog key, not text: the form shows it in the interface language.
  caseText: z.string().trim().min(1, 'validation.caseTextRequired'),
  aggressiveness: z.enum(['mild', 'moderate', 'ruthless']),
  judgeParadigm: z.enum(['logic', 'values', 'policy']),
  detectFallacies: z.boolean(),
  analyzeWeighing: z.boolean(),
});

export type AttackInput = z.infer<typeof AttackInputSchema>;

export const WeaknessSchema = z.object({
  id: z.string(),
  severity: z.enum(['critical', 'major', 'minor']),
  type: z.enum(['logical', 'evidential', 'structural', 'strategic']),
  description: z.string(),
  whyWeak: z.string(),
  howOpponentAttacks: z.string(),
  improvedVersion: z.string(),
  affectedQuote: z.string().optional(),
});

export const AttackOutputSchema = z.object({
  overallAssessment: z.object({
    score: z.number().min(0).max(100),
    summary: z.string(),
    strengthAreas: z.array(z.string()),
  }),
  weaknesses: z.array(WeaknessSchema),
  fallaciesDetected: z.array(z.object({
    name: z.string(),
    location: z.string(),
    explanation: z.string(),
  })),
  crossExQuestions: z.array(z.object({
    question: z.string(),
    purpose: z.string(),
    expectedTrap: z.string(),
  })),
  weighingAnalysis: z.object({
    currentWeighing: z.string(),
    missingComparisons: z.array(z.string()),
    improvementSuggestions: z.array(z.string()),
  }),
});

export type AttackOutput = z.infer<typeof AttackOutputSchema>;
export type Weakness = z.infer<typeof WeaknessSchema>;
