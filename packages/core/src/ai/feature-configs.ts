import {
  AUTO_FAST,
  AUTO_PRO,
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
  getModelCatalogEntry,
  isAutoModelSelection,
  isReasoningEffort,
  retiredModelSuccessor,
} from '../contract/model-catalog';
import { PROVIDER_ID, type ProviderConfig } from './providers/types';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring';

const defaultConfig: ProviderConfig = {
  provider: PROVIDER_ID,
  model: DEFAULT_MODEL,
  reasoningEffort: 'low',
};

/**
 * The model settings each tool starts with. The website saves these in
 * user_settings.feature_configs, and the app writes them too when it saves the
 * first setting, because the website reads an empty feature_configs as "never
 * saved". Both pass DEFAULT_PRO_MODEL when the plan (supabase/billing.ts)
 * includes Pro models.
 */
export const getDefaultFeatureConfigs = (model: string = DEFAULT_MODEL): Record<FeatureTab, ProviderConfig> => ({
  generate: { ...defaultConfig, model },
  attack: { ...defaultConfig, model },
  brainstorm: { ...defaultConfig, model },
  factoids: { ...defaultConfig, model },
  ask: { ...defaultConfig, model },
  sparring: { ...defaultConfig, model },
});

// How a saved feature_configs value is read, on the website and in the app.
const LEGACY_MODEL_SUCCESSORS: Record<string, string> = {
  'gpt-5.5': DEFAULT_MODEL,
  'gpt-5.4': DEFAULT_MODEL,
  'gpt-5.4-mini': DEFAULT_MODEL,
  'gpt-4o': DEFAULT_MODEL,
  'gpt-4o-mini': DEFAULT_MODEL,
  'claude-opus-4-7': 'anthropic/claude-opus-5.5',
  'claude-sonnet-4-6': DEFAULT_PRO_MODEL,
  'claude-haiku-4-5-20251001': DEFAULT_MODEL,
  'gemini-3.1-pro-preview': 'google/gemini-3.8-flash',
  'gemini-3.5-flash': 'google/gemini-3.8-flash',
  'gemini-3-flash-preview': 'google/gemini-3.8-flash',
  'gemini-3.1-flash-lite-preview': 'google/gemini-3.8-flash',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeModelId(value: unknown, fallback: string = DEFAULT_MODEL): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const model = value.trim();
  if (isAutoModelSelection(model)) return model;
  if (getModelCatalogEntry(model)) return model;
  return retiredModelSuccessor(model) ?? LEGACY_MODEL_SUCCESSORS[model] ?? DEFAULT_MODEL;
}

export function normalizeFeatureConfig(
  value: unknown,
  fallback: ProviderConfig,
  allowProModels = true,
): ProviderConfig {
  const candidate = asRecord(value);
  const model = normalizeModelId(candidate?.model, fallback.model);
  const reasoningEffort = isReasoningEffort(candidate?.reasoningEffort)
    ? candidate.reasoningEffort
    : fallback.reasoningEffort ?? 'low';

  return {
    provider: PROVIDER_ID,
    model: !allowProModels && model === AUTO_PRO
      ? AUTO_FAST
      : !allowProModels && getModelCatalogEntry(model)?.isProOnly
        ? DEFAULT_MODEL
        : model,
    reasoningEffort,
  };
}

export function normalizeFeatureConfigs(
  configs: unknown,
  allowProModels = true,
  fallbackModel: string = DEFAULT_MODEL,
): Record<FeatureTab, ProviderConfig> {
  const defaults = getDefaultFeatureConfigs(fallbackModel);
  const saved = asRecord(configs);
  if (!saved) return defaults;

  return Object.fromEntries((Object.keys(defaults) as FeatureTab[]).map((feature) => {
    return [feature, normalizeFeatureConfig(saved[feature], defaults[feature], allowProModels)];
  })) as Record<FeatureTab, ProviderConfig>;
}

export function featureConfigsAreCanonical(value: unknown, expected: Record<FeatureTab, ProviderConfig>): boolean {
  const saved = asRecord(value);
  const features = Object.keys(expected) as FeatureTab[];
  if (!saved || Object.keys(saved).length !== features.length) return false;

  const allowedKeys = new Set(['provider', 'model', 'reasoningEffort']);
  return features.every((feature) => {
    const config = asRecord(saved[feature]);
    if (!config) return false;
    const target = expected[feature];
    return Object.keys(config).every((key) => allowedKeys.has(key))
      && config.provider === target.provider
      && config.model === target.model
      && config.reasoningEffort === target.reasoningEffort;
  });
}
