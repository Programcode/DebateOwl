// src/lib/ai/providers/types.ts

import { MODEL_CATALOG } from '../../../../supabase/functions/_shared/model-catalog';
import type { ReasoningEffort } from '../../../../supabase/functions/_shared/model-catalog';

export {
  AUTO_MODEL_SELECTIONS,
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
  isAutoModelSelection,
  isModelSelection,
  isReasoningEffort,
} from '../../../../supabase/functions/_shared/model-catalog';
export type {
  AutoModelSelection,
  ModelSelection,
  ReasoningEffort,
} from '../../../../supabase/functions/_shared/model-catalog';
export type { ModelCatalogEntry as AIModel } from '../../../../supabase/functions/_shared/model-catalog';

/** Every accepted model routes through OpenRouter; see _shared/model-catalog. */
export const PROVIDER_ID = 'openrouter';

export const AVAILABLE_MODELS = MODEL_CATALOG;

export interface ProviderConfig {
  provider: string;
  model: string;
  temperature: number;
  reasoningEffort?: ReasoningEffort;
}
