// packages/core/src/ai/schemas/generate.ts
import { z } from 'zod';

export const GenerateInputSchema = z.object({
  // A catalog key, not text: the form shows it in the interface language.
  motion: z.string().min(1, 'validation.motionRequired'),
  side: z.enum(['pro', 'con']),
  format: z.enum(['custom', 'bp', 'policy', 'classroom']), // Kept others for backward compatibility but UI will restrict
  role: z.enum(['intro', 'r1', 'r2', 'conc', 'general']),
  length: z.enum(['brief', 'standard', 'comprehensive']),
  audience: z.enum(['beginner', 'intermediate', 'advanced']),
  tone: z.enum(['formal', 'conversational', 'aggressive']),
});

export type GenerateInput = z.infer<typeof GenerateInputSchema>;

// Each argument reads Title, Point (claim), Explanation (reasoning), Evidence and
// Why it matters (impact). The keys stay as they were so saved cases keep loading.
export const ContentionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  claim: z.string(),
  reasoning: z.string(),
  evidence: z.string(),
  needsSource: z.boolean(),
  sourceQuery: z.string().optional(),
  impact: z.string(),
});

/** Older cases only: the Introductor's hook and bridge, now part of the opening. */
export const ExordioSchema = z.object({
  hook: z.string(),
  transition: z.string(),
});

export const OpeningSchema = z.object({
  hook: z.string(),
  /** One line defining a motion term, only when the term is genuinely unclear. */
  definition: z.string().optional(),
});

/** One "If they say…" item: their claim, our answer, and an optional source. */
export const CounterSchema = z.object({
  targetArgument: z.string(),
  counterpoint: z.string(),
  /** Older cases only: a second, in-round phrasing of the answer. */
  rebuttal: z.string().optional(),
  source: z.string().optional(),
});

export const CaseSourceSchema = z.object({
  org: z.string(),
  year: z.string().optional(),
  claim: z.string(),
  url: z.string().optional(),
});

export const GenerateOutputSchema = z.object({
  opening: OpeningSchema.optional(),
  exordio: ExordioSchema.optional(),
  // thesis is the opening's "we will show N arguments that prove…" line. The
  // other three are older cases' sections, shown only when they have content.
  caseStructure: z.object({
    thesis: z.string(),
    framework: z.string().optional(),
    keyDefinitions: z.array(z.string()).optional(),
    burdenOfProof: z.string().optional(),
  }),
  contentions: z.array(ContentionSchema),
  /** Older cases only; new cases fold the opponent's arguments into counters. */
  predictedOpponentCase: z.object({
    likelyArguments: z.array(z.string()).optional(),
    strategicWeaknesses: z.array(z.string()).optional(),
    keyClashes: z.array(z.string()).optional(),
  }).optional(),
  counters: z.array(CounterSchema),
  /** Conclusor only: two or three summaries of why our side wins. */
  whyWeWin: z.array(z.string()).optional(),
  closingLine: z.string().optional(),
  sources: z.array(CaseSourceSchema).optional(),
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
export type Counter = z.infer<typeof CounterSchema>;
export type CaseSource = z.infer<typeof CaseSourceSchema>;
