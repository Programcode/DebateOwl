// packages/core/src/ai/schemas/brainstorm.ts
import { z } from 'zod';

export const BrainstormInputSchema = z.object({
  // A catalog key, not text: the form shows it in the interface language.
  motion: z.string().min(1, 'validation.motionRequired'),
  side: z.enum(['pro', 'con', 'both']),
  context: z.string().optional(),
  outputMode: z.enum(['mindmap', 'buckets', 'topfive']),
});

export type BrainstormInput = z.infer<typeof BrainstormInputSchema>;

export const IdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  side: z.enum(['pro', 'con', 'neutral']),
  strength: z.enum(['strong', 'moderate', 'weak']),
  tradeoffs: z.array(z.string()),
  relatedTo: z.array(z.string()),
});

export const BucketSchema = z.object({
  name: z.string(),
  ideas: z.array(IdeaSchema),
  keyInsight: z.string(),
});

export const BrainstormOutputSchema = z.object({
  clarifyingQuestions: z.array(z.string()).optional(),
  needsMoreInfo: z.boolean(),
  mindmap: z.array(z.object({
    category: z.string(),
    items: z.array(IdeaSchema),
  })).optional(),
  buckets: z.array(BucketSchema).optional(),
  topFive: z.array(z.object({
    rank: z.number(),
    idea: IdeaSchema,
    whyTop: z.string(),
  })).optional(),
  nextSteps: z.array(z.string()),
  warningsAndTradeoffs: z.array(z.string()),
});

export type BrainstormOutput = z.infer<typeof BrainstormOutputSchema>;
export type Idea = z.infer<typeof IdeaSchema>;
