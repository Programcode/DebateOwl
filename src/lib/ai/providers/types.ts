// src/lib/ai/providers/types.ts

import { MODEL_CATALOG } from '../../../../supabase/functions/_shared/model-catalog';
import type { ReasoningEffort } from '../../../../supabase/functions/_shared/model-catalog';

export { DEFAULT_MODEL, DEFAULT_PRO_MODEL, isReasoningEffort } from '../../../../supabase/functions/_shared/model-catalog';
export type { ReasoningEffort } from '../../../../supabase/functions/_shared/model-catalog';

export interface AIProvider {
  id: string;
  name: string;
  models: readonly AIModel[];
  isAvailable: () => boolean;
}

export interface AIModel {
  id: string;
  name: string;
  maxTokens: number;
  isProOnly: boolean;
  supportsTemperature: boolean;
  supportedEfforts: readonly ReasoningEffort[];
}

export interface ProviderConfig {
  provider: string;
  model: string;
  temperature: number;
  reasoningEffort?: ReasoningEffort;
}

export const DEFAULT_PROVIDERS: AIProvider[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    models: MODEL_CATALOG,
    isAvailable: () => true,
  },
];
