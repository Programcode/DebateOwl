import { z } from 'zod';

export const SparringSideSchema = z.enum(['pro', 'con']);
export const SparringDifficultySchema = z.enum(['beginner', 'competitive', 'brutal']);
export const SparringTurnRoleSchema = z.enum(['user', 'ai']);
export const SparringTurnPhaseSchema = z.enum(['opening', 'rebuttal']);

export const SparringTurnSchema = z.object({
  id: z.string().min(1),
  role: SparringTurnRoleSchema,
  phase: SparringTurnPhaseSchema,
  content: z.string().min(1),
  createdAt: z.number().finite(),
});

export const SparringSetupSchema = z.object({
  motion: z.string().trim().min(8, 'Enter a complete debate motion.').max(1200),
  side: SparringSideSchema,
  difficulty: SparringDifficultySchema,
  useActiveSources: z.boolean().default(true),
});

export const SparringOpponentOutputSchema = z.object({
  speech: z.string().trim().min(1),
  pressurePoints: z.array(z.string().trim().min(1)).max(4).default([]),
});

export const SparringRatingSchema = z.enum(['needs-work', 'solid', 'strong']);

export const SparringCategoryFeedbackSchema = z.object({
  category: z.enum([
    'argument-strength',
    'warrant-quality',
    'impact-analysis',
    'engagement',
    'rebuttal-efficiency',
    'weighing',
    'evidence-use',
    'strategy',
  ]),
  rating: SparringRatingSchema,
  evidence: z.string().trim().min(1),
  advice: z.string().trim().min(1),
});

export const SparringScorecardSchema = z.object({
  verdict: z.enum(['user-edge', 'ai-edge', 'close']),
  summary: z.string().trim().min(1),
  biggestImprovement: z.string().trim().min(1),
  strengths: z.array(z.string().trim().min(1)).max(5).default([]),
  missedArguments: z.array(z.string().trim().min(1)).max(5).default([]),
  categories: z.array(SparringCategoryFeedbackSchema).min(4).max(8),
  nextDrill: z.string().trim().min(1),
});

export const SparringSessionSchema = z.object({
  id: z.string().min(1),
  setup: SparringSetupSchema,
  turns: z.array(SparringTurnSchema).max(8),
  scorecard: SparringScorecardSchema.optional(),
  status: z.enum(['active', 'complete']),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
});

export type SparringSide = z.infer<typeof SparringSideSchema>;
export type SparringDifficulty = z.infer<typeof SparringDifficultySchema>;
export type SparringTurn = z.infer<typeof SparringTurnSchema>;
export type SparringSetup = z.infer<typeof SparringSetupSchema>;
export type SparringOpponentOutput = z.infer<typeof SparringOpponentOutputSchema>;
export type SparringScorecard = z.infer<typeof SparringScorecardSchema>;
export type SparringSession = z.infer<typeof SparringSessionSchema>;
