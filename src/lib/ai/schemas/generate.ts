// src/lib/ai/schemas/generate.ts
import { z } from 'zod';

export const GenerateInputSchema = z.object({
  motion: z.string().min(1, 'Motion is required'),
  side: z.enum(['pro', 'con', 'auto']),
  format: z.enum(['bp', 'policy', 'classroom']),
  role: z.enum(['r1', 'r2', 'general']),
  length: z.enum(['brief', 'standard', 'comprehensive']),
  audience: z.enum(['beginner', 'intermediate', 'advanced']),
  tone: z.enum(['formal', 'conversational', 'aggressive']),
  language: z.enum(['en', 'es']),
});

export type GenerateInput = z.infer<typeof GenerateInputSchema>;

export const ContentionSchema = z.object({
  id: z.string(),
  claim: z.string(),
  reasoning: z.string(),
  evidence: z.string(),
  needsSource: z.boolean(),
  sourceQuery: z.string().optional(),
  impact: z.string(),
});

export const GenerateOutputSchema = z.object({
  caseStructure: z.object({
    thesis: z.string(),
    framework: z.string(),
    keyDefinitions: z.array(z.string()),
    burdenOfProof: z.string(),
  }),
  contentions: z.array(ContentionSchema),
  predictedOpponentCase: z.object({
    likelyArguments: z.array(z.string()),
    strategicWeaknesses: z.array(z.string()),
    keyClashes: z.array(z.string()),
  }),
  counters: z.array(z.object({
    targetArgument: z.string(),
    counterpoint: z.string(),
    rebuttal: z.string(),
  })),
  metadata: z.object({
    side: z.enum(['pro', 'con']),
    format: z.string(),
    generatedAt: z.string(),
  }),
});

export type GenerateOutput = z.infer<typeof GenerateOutputSchema>;
export type Contention = z.infer<typeof ContentionSchema>;
