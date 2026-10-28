// packages/core/src/ai/schemas/ask.ts
import { z } from 'zod';
import { SafeWebUrlSchema } from './url';

export const AskInputSchema = z.object({
  // A catalog key, not text: the form shows it in the interface language.
  message: z.string().min(1, 'validation.messageRequired'),
  mode: z.enum(['general', 'clarify', 'summarize', 'proscons', 'argumentmap']),
  citationMode: z.boolean(),
  webSearch: z.boolean().optional(),
  prosConsMode: z.boolean().optional(),
  argumentMapMode: z.boolean().optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
});

export type AskInput = z.infer<typeof AskInputSchema>;

export const AskOutputSchema = z.object({
  response: z.string(),
  model: z.string().optional(),
  provider: z.string().optional(),
  durationMs: z.number().optional(),
  generatedAt: z.string().optional(),
  citations: z.array(z.object({
    claim: z.string(),
    source: z.string().optional(),
    verified: z.boolean(),
    note: z.string().optional(),
  })).optional(),
  searchInfo: z.object({
    webSearchUsed: z.boolean(),
    queries: z.array(z.string()),
    sources: z.array(z.object({
      title: z.string(),
      url: SafeWebUrlSchema,
      verified: z.boolean(),
      sourceType: z.string().optional(),
      qualityScore: z.number().optional(),
      qualityLabel: z.enum(['strong', 'moderate', 'weak']).optional(),
    })),
  }).optional(),
  followUpQuestions: z.array(z.string()),
  prosConsAnalysis: z.object({
    pros: z.array(z.string()),
    cons: z.array(z.string()),
  }).optional(),
  argumentMap: z.object({
    mainClaim: z.string(),
    supportingPoints: z.array(z.string()),
    counterpoints: z.array(z.string()),
    assumptions: z.array(z.string()),
  }).optional(),
  uncertainties: z.array(z.string()),
  /** A streamed answer stopped at its length cap; the notice is translated when shown. */
  replyTruncated: z.boolean().optional(),
});

export type AskOutput = z.infer<typeof AskOutputSchema>;
