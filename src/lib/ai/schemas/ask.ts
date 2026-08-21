// src/lib/ai/schemas/ask.ts
import { z } from 'zod';

const SafeWebUrlSchema = z.string().url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  },
  'Source URLs must use http or https',
);

export const AskInputSchema = z.object({
  message: z.string().min(1, 'Message is required'),
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
});

export type AskOutput = z.infer<typeof AskOutputSchema>;
