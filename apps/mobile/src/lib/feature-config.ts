import { getDefaultFeatureConfigs, normalizeFeatureConfig, type FeatureTab } from '@debatelab/core/ai/feature-configs';
import { type ProviderConfig } from '@debatelab/core/ai/providers/types';
import { readProModelAccess } from '@debatelab/core/supabase/billing';
import {
  AUTO_PRO,
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
  getModelCatalogEntry,
  type ReasoningEffort,
} from '@debatelab/core/contract/model-catalog';

import { billingQuery, supabase } from './supabase';

/**
 * A tool's model and its settings, picked exactly as the website's settings
 * store (src/lib/stores/settings-store.ts) picks them from
 * user_settings.feature_configs, with the same normalizer
 * (packages/core/src/ai/feature-configs.ts). The model picker writes them back
 * through the settings provider; the migration that rewrites old configs stays
 * on the website.
 */
export interface FeatureConfig {
  model: string;
  reasoningEffort: ReasoningEffort;
}

function defaultConfig(feature: FeatureTab, model: string = DEFAULT_MODEL): ProviderConfig {
  return getDefaultFeatureConfigs(model)[feature];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeConfig(value: unknown, fallback: ProviderConfig, allowProModels: boolean): FeatureConfig {
  const { model, reasoningEffort } = normalizeFeatureConfig(value, fallback, allowProModels);
  return { model, reasoningEffort: reasoningEffort ?? 'low' };
}

/** Whether the student may pick Pro models, by the website's billing resolver; null when the plan cannot be read. */
export async function canUseProModels(userId: string): Promise<boolean | null> {
  return readProModelAccess(billingQuery(userId));
}

/** A tool's settings and whether the student has Pro access (false when it cannot be told). */
export async function fetchFeatureSettings(userId: string, feature: FeatureTab): Promise<{ config: FeatureConfig; pro: boolean }> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('feature_configs')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return { config: normalizeConfig(null, defaultConfig(feature), false), pro: false };
  // Null when the plan cannot be read, as on the website, which then keeps its defaults.
  const allowProModels = await canUseProModels(userId);
  if (allowProModels === null) return { config: normalizeConfig(null, defaultConfig(feature), false), pro: false };
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
    const config = normalizeFeatureConfig(record?.[name], defaultConfig(name, fallbackModel), pro);
    return [name, { ...config, ...(name === feature ? change : {}) }];
  })) as Record<FeatureTab, ProviderConfig>;
}
