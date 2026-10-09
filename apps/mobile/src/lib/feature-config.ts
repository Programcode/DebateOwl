import { getDefaultFeatureConfigs, type FeatureTab } from '@debatelab/core/ai/feature-configs';
import { canAccessProModels } from '@debatelab/core/ai/pro-access';
import {
  AUTO_FAST,
  AUTO_PRO,
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
  getModelCatalogEntry,
  isAutoModelSelection,
  isReasoningEffort,
  type ReasoningEffort,
} from '@debatelab/core/contract/model-catalog';

import { supabase } from './supabase';

/**
 * A tool's model and its settings, picked exactly as the website's settings
 * store (src/lib/stores/settings-store.ts) picks them from
 * user_settings.feature_configs. The app only reads them: the model picker
 * and the migration that rewrites old configs stay on the website.
 */
export interface FeatureConfig {
  model: string;
  temperature: number;
  reasoningEffort: ReasoningEffort;
}

function defaultConfig(feature: FeatureTab, model: string = DEFAULT_MODEL): FeatureConfig {
  const { temperature, reasoningEffort } = getDefaultFeatureConfigs(model)[feature];
  return { model, temperature, reasoningEffort: reasoningEffort ?? 'low' };
}

const LEGACY_MODEL_SUCCESSORS: Record<string, string> = {
  'gpt-5.5': DEFAULT_MODEL,
  'gpt-5.4': DEFAULT_MODEL,
  'gpt-5.4-mini': DEFAULT_MODEL,
  'gpt-4o': DEFAULT_MODEL,
  'gpt-4o-mini': DEFAULT_MODEL,
  'claude-opus-4-7': DEFAULT_PRO_MODEL,
  'claude-sonnet-4-6': DEFAULT_PRO_MODEL,
  'claude-haiku-4-5-20251001': DEFAULT_MODEL,
  'gemini-3.1-pro-preview': 'google/gemini-3.8-flash',
  'gemini-3.5-flash': 'google/gemini-3.8-flash',
  'gemini-3-flash-preview': 'google/gemini-3.8-flash',
  'gemini-3.1-flash-lite-preview': 'google/gemini-3.8-flash',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeModelId(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const model = value.trim();
  if (isAutoModelSelection(model)) return model;
  if (getModelCatalogEntry(model)) return model;
  return LEGACY_MODEL_SUCCESSORS[model] ?? DEFAULT_MODEL;
}

function normalizeConfig(value: unknown, fallback: FeatureConfig, allowProModels: boolean): FeatureConfig {
  const candidate = asRecord(value);
  const model = normalizeModelId(candidate?.model, fallback.model);
  return {
    model: !allowProModels && model === AUTO_PRO
      ? AUTO_FAST
      : !allowProModels && getModelCatalogEntry(model)?.isProOnly
        ? DEFAULT_MODEL
        : model,
    temperature: typeof candidate?.temperature === 'number' && Number.isFinite(candidate.temperature)
      ? candidate.temperature
      : fallback.temperature,
    reasoningEffort: isReasoningEffort(candidate?.reasoningEffort) ? candidate.reasoningEffort : fallback.reasoningEffort,
  };
}

export async function fetchFeatureConfig(userId: string, feature: FeatureTab): Promise<FeatureConfig> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('feature_configs, subscription_tier, grace_period_ends_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return defaultConfig(feature);
  // Null when it cannot be told, as on the website, which then keeps its defaults.
  const allowProModels = await canAccessProModels(data, async () => {
    const { data: rows, error: billingError } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userId);
    return billingError ? null : rows ?? [];
  });
  if (allowProModels === null) return defaultConfig(feature);
  const fallback = defaultConfig(feature, allowProModels ? DEFAULT_PRO_MODEL : DEFAULT_MODEL);
  return normalizeConfig(asRecord(data.feature_configs)?.[feature], fallback, allowProModels);
}
