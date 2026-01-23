// src/lib/ai/schemas/ask.ts
import { z } from 'zod';

export const AskInputSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  mode: z.enum(['general', 'clarify', 'summarize', 'proscons', 'argumentmap']),
  citationMode: z.boolean(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
});

export type AskInput = z.infer<typeof AskInputSchema>;

export const AskOutputSchema = z.object({
  response: z.string(),
  citations: z.array(z.object({
    claim: z.string(),
    source: z.string().optional(),
    verified: z.boolean(),
    note: z.string().optional(),
  })).optional(),
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
