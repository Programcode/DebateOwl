// src/lib/ai/schemas/factoids.ts
import { z } from 'zod';

export const FactoidsInputSchema = z.object({
  claim: z.string().min(1, 'Claim is required'),
  direction: z.enum(['for', 'against']).default('for'),
  region: z.string().optional(),
  sourceType: z.enum(['academic', 'government', 'news', 'any']),
  timeframe: z.string().optional(),
  sourceCount: z.coerce.number().min(3).max(15).default(5),
});

export type FactoidsInput = z.infer<typeof FactoidsInputSchema>;

export const CitationSchema = z.object({
  title: z.string(),
  publisher: z.string(),
  date: z.string().optional(),
  url: z.string().optional(), // Relaxed from .url()
  verified: z.enum(['verified', 'unverified', 'pending']),
  verifiedAt: z.string().optional(),
});

export const FactoidSchema = z.object({
  id: z.string(),
  shortClaim: z.string(),
  keyFigure: z.string(),
  context: z.string(),
  limitations: z.string(),
  citation: CitationSchema,
  howToUse: z.string(),
  relevanceScore: z.number().min(0).max(100),
});

export const FactoidsOutputSchema = z.object({
  factoids: z.array(FactoidSchema),
  searchSuggestions: z.array(z.string()),
  warnings: z.array(z.string()),
  verificationStatus: z.enum(['pending', 'inProgress', 'complete']),
});

export type FactoidsOutput = z.infer<typeof FactoidsOutputSchema>;
export type Factoid = z.infer<typeof FactoidSchema>;
export type Citation = z.infer<typeof CitationSchema>;
