import { z } from 'zod';
import { SpeechDeliverySchema } from '@/lib/voice/delivery';

export const SparringSideSchema = z.enum(['pro', 'con']);
export const SparringFormatSchema = z.enum(['standard', 'ld', 'pf']);
export const SparringDifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const SparringSpeakerSchema = z.enum(['user', 'ai']);
export const SparringTurnKindSchema = z.enum([
  'introductor',
  'r1',
  'r2',
  'conclusor',
  'opening',
  'constructive',
  'rebuttal',
  'summary',
  'final',
]);

export const SparringTurnSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  side: SparringSideSchema,
  kind: SparringTurnKindSchema,
  timeLimitSeconds: z.number().int().positive(),
});

/** A completed turn from either debater, sent as context for the next call. */
export const SparringSpeechSchema = z.object({
  id: z.string().trim().min(1),
  turnId: z.string().trim().min(1),
  speaker: SparringSpeakerSchema,
  side: SparringSideSchema,
  role: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(6_000),
  createdAt: z.number().finite(),
  timeLimitSeconds: z.number().int().positive(),
  timeUsedSeconds: z.number().int().nonnegative(),
  integrityToken: z.string().trim().min(32).max(128).optional(),
  /** Measured facts for a user speech that was spoken aloud in a voice round. */
  delivery: SpeechDeliverySchema.optional(),
});

/** Shared, bounded session context carried by both sparring actions. */
export const SparringSessionSchema = z.object({
  sessionId: z.string().uuid(),
  motion: z.string().trim().min(1).max(1_200),
  userSide: SparringSideSchema,
  format: SparringFormatSchema,
  difficulty: SparringDifficultySchema,
  speeches: z.array(SparringSpeechSchema).max(12),
  language: z.string().trim().min(1).max(32),
});

export const SparringRespondInputSchema = SparringSessionSchema.extend({
  action: z.literal('respond'),
  currentTurn: SparringTurnSchema,
});

export const SparringScoreInputSchema = SparringSessionSchema.extend({
  action: z.literal('score'),
});

export const SparringInputSchema = z.discriminatedUnion('action', [
  SparringRespondInputSchema,
  SparringScoreInputSchema,
]);

export const SparringTurnResponseSchema = z.object({
  action: z.literal('respond'),
  speech: z.object({
    content: z.string().trim().min(1).max(6_000),
    strategy: z.string().trim().min(1).max(2_000),
    targetedPoints: z.array(z.string().trim().min(1).max(500)).max(8),
    integrityToken: z.string().trim().min(32).max(128).optional(),
  }),
});

export const SparringScoreCategoryNameSchema = z.enum([
  'Logic',
  'Evidence',
  'Delivery',
  'Strategy',
]);

export const SparringScoreCategorySchema = z.object({
  name: SparringScoreCategoryNameSchema,
  userScore: z.number().int().min(0).max(25),
  aiScore: z.number().int().min(0).max(25),
  feedback: z.string().trim().min(1).max(2_000),
});

const REQUIRED_SCORE_CATEGORIES = new Set(['Logic', 'Evidence', 'Delivery', 'Strategy']);

export const SparringScorecardSchema = z.object({
  userScore: z.number().int().min(0).max(100),
  aiScore: z.number().int().min(0).max(100),
  categories: z.array(SparringScoreCategorySchema).length(4).superRefine((categories, ctx) => {
    const names: Set<string> = new Set(categories.map((category) => category.name));
    if (names.size !== REQUIRED_SCORE_CATEGORIES.size || ['Logic', 'Evidence', 'Delivery', 'Strategy'].some((name) => !names.has(name))) {
      ctx.addIssue({
        code: 'custom',
        message: 'Categories must include exactly Logic, Evidence, Delivery, and Strategy.',
      });
    }
  }),
  overallFeedback: z.string().trim().min(1).max(4_000),
  keyMoments: z.array(z.string().trim().min(1).max(1_000)).max(12),
  improvementAreas: z.array(z.string().trim().min(1).max(1_000)).max(12),
  winner: z.enum(['user', 'ai', 'tie']),
  verdict: z.string().trim().min(1).max(2_000),
}).superRefine((scorecard, ctx) => {
  const categoryUserScore = scorecard.categories.reduce((total, category) => total + category.userScore, 0);
  const categoryAiScore = scorecard.categories.reduce((total, category) => total + category.aiScore, 0);
  if (scorecard.userScore !== categoryUserScore) {
    ctx.addIssue({ code: 'custom', path: ['userScore'], message: 'userScore must equal the category score total.' });
  }
  if (scorecard.aiScore !== categoryAiScore) {
    ctx.addIssue({ code: 'custom', path: ['aiScore'], message: 'aiScore must equal the category score total.' });
  }
  const expectedWinner = scorecard.userScore === scorecard.aiScore
    ? 'tie'
    : scorecard.userScore > scorecard.aiScore ? 'user' : 'ai';
  if (scorecard.winner !== expectedWinner) {
    ctx.addIssue({ code: 'custom', path: ['winner'], message: 'winner must match the aggregate scores.' });
  }
});

export const SparringScoreResponseSchema = z.object({
  action: z.literal('score'),
  scorecard: SparringScorecardSchema,
});

export const SparringResponseSchema = z.discriminatedUnion('action', [
  SparringTurnResponseSchema,
  SparringScoreResponseSchema,
]);

export type SparringSide = z.infer<typeof SparringSideSchema>;
export type SparringFormat = z.infer<typeof SparringFormatSchema>;
export type SparringDifficulty = z.infer<typeof SparringDifficultySchema>;
export type SparringSpeaker = z.infer<typeof SparringSpeakerSchema>;
export type SparringTurnKind = z.infer<typeof SparringTurnKindSchema>;
export type SparringTurn = z.infer<typeof SparringTurnSchema>;
export type SparringSpeech = z.infer<typeof SparringSpeechSchema>;
export type SparringSession = z.infer<typeof SparringSessionSchema>;
export type SparringRespondInput = z.infer<typeof SparringRespondInputSchema>;
export type SparringScoreInput = z.infer<typeof SparringScoreInputSchema>;
export type SparringInput = z.infer<typeof SparringInputSchema>;
export type SparringTurnResponse = z.infer<typeof SparringTurnResponseSchema>;
export type SparringScoreCategory = z.infer<typeof SparringScoreCategorySchema>;
export type SparringScorecard = z.infer<typeof SparringScorecardSchema>;
export type SparringScoreResponse = z.infer<typeof SparringScoreResponseSchema>;
export type SparringResponse = z.infer<typeof SparringResponseSchema>;
