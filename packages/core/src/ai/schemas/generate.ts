// src/lib/ai/schemas/generate.ts
import { z } from 'zod';

export const GenerateInputSchema = z.object({
  motion: z.string().min(1, 'Motion is required'),
  side: z.enum(['pro', 'con']),
  format: z.enum(['custom', 'bp', 'policy', 'classroom']), // Kept others for backward compatibility but UI will restrict
  role: z.enum(['intro', 'r1', 'r2', 'conc', 'general']),
  length: z.enum(['brief', 'standard', 'comprehensive']),
  audience: z.enum(['beginner', 'intermediate', 'advanced']),
  tone: z.enum(['formal', 'conversational', 'aggressive']),
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

export const ExordioSchema = z.object({
  hook: z.string(),
  transition: z.string(),
});

export const GenerateOutputSchema = z.object({
  exordio: ExordioSchema.optional(),
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
    motion: z.string().optional(),
    generatedAt: z.string(),
    model: z.string().optional(),
    provider: z.string().optional(),
    durationMs: z.number().optional(),
    sourceUsage: z.array(z.object({
      key: z.string(),
      id: z.string().optional(),
      title: z.string(),
      origin: z.string().optional(),
      importance: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
      strength: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
      probability: z.number().min(0).max(1),
      judgment: z.enum(['used', 'uncertain', 'not_used']),
    })).max(10).optional(),
  }),
});

export type GenerateOutput = z.infer<typeof GenerateOutputSchema>;
export type Contention = z.infer<typeof ContentionSchema>;
