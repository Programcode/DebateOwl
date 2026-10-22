import { getDefaultFeatureConfigs, type FeatureTab } from '@debatelab/core/ai/feature-configs';
import { PROVIDER_ID, type ProviderConfig } from '@debatelab/core/ai/providers/types';
import { readEntitlement } from '@debatelab/core/supabase/entitlement';
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
 * user_settings.feature_configs. The model picker writes them back through the
 * settings provider; the migration that rewrites old configs stays on the website.
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

/** Whether the student may pick Pro models, from effective_entitlement; null when the plan cannot be read. */
export async function canUseProModels(userId: string): Promise<boolean | null> {
  return (await readEntitlement(supabase, userId))?.canAccessProModels ?? null;
}

/** A tool's settings and whether the student has Pro access (false when it cannot be told). */
export async function fetchFeatureSettings(userId: string, feature: FeatureTab): Promise<{ config: FeatureConfig; pro: boolean }> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('feature_configs')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return { config: defaultConfig(feature), pro: false };
  // Null when the plan cannot be read, as on the website, which then keeps its defaults.
  const allowProModels = await canUseProModels(userId);
  if (allowProModels === null) return { config: defaultConfig(feature), pro: false };
  const fallback = defaultConfig(feature, allowProModels ? DEFAULT_PRO_MODEL : DEFAULT_MODEL);
  return { config: normalizeConfig(asRecord(data.feature_configs)?.[feature], fallback, allowProModels), pro: allowProModels };
}

export async function fetchFeatureConfig(userId: string, feature: FeatureTab): Promise<FeatureConfig> {
  return (await fetchFeatureSettings(userId, feature)).config;
}

export type FeatureConfigChange = Partial<Pick<FeatureConfig, 'model' | 'reasoningEffort'>>;

/** Whether a model or Auto choice is for Pro students only, as the website's ModelSelector marks it. */
export function isProOnlyModel(model: string): boolean {
  return model === AUTO_PRO || Boolean(getModelCatalogEntry(model)?.isProOnly);
}

/**
 * The whole feature_configs object the website would save after this change,
 * in its canonical shape, so the website keeps it as it is: every tool's saved
 * config normalised as the website's normalizeFeatureConfigs does (its
 * defaults where none was saved), with the change applied to one tool.
 */
export function featureConfigsWith(saved: unknown, pro: boolean, feature: FeatureTab, change: FeatureConfigChange): Record<FeatureTab, ProviderConfig> {
  if (change.model !== undefined && !pro && isProOnlyModel(change.model)) throw new Error('Pro models need Pro access');
  const record = asRecord(saved);
  const fallbackModel = pro ? DEFAULT_PRO_MODEL : DEFAULT_MODEL;
  const features = Object.keys(getDefaultFeatureConfigs()) as FeatureTab[];
  return Object.fromEntries(features.map((name) => {
    const config = normalizeConfig(record?.[name], defaultConfig(name, fallbackModel), pro);
    return [name, { provider: PROVIDER_ID, ...config, ...(name === feature ? change : {}) }];
  })) as Record<FeatureTab, ProviderConfig>;
}
