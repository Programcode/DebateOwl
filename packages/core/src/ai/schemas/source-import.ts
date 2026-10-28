import { z } from 'zod';
import { SafeWebUrlSchema } from './url';

export const SourceImportOutputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  wordCount: z.number().int().nonnegative(),
  author: z.string().optional(),
  publishedDate: z.string().optional(),
  domain: z.string().min(1),
  excerpt: z.string(),
  url: SafeWebUrlSchema,
  /** True when the page was longer than the import cap. */
  truncated: z.boolean().optional(),
});

export type SourceImportOutput = z.infer<typeof SourceImportOutputSchema>;
