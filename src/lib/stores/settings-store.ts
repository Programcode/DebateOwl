import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyAppLanguage } from '@/i18n';
import { isAppLanguage, type AppLanguage } from '@/lib/languages';
import {
  AUTO_FAST,
  AUTO_PRO,
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
  getModelCatalogEntry,
  isAutoModelSelection,
  isReasoningEffort,
} from '../../../supabase/functions/_shared/model-catalog';
import type { ProviderConfig } from '../ai/providers/types';
import { supabase } from '@/lib/supabase/client';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring';
type CoreFeatureTab = Exclude<FeatureTab, 'sparring'>;
type FeatureConfigs = Record<CoreFeatureTab, ProviderConfig> & Partial<Record<'sparring', ProviderConfig>>;

interface SettingsState {
  language: AppLanguage;
  outputLanguage: AppLanguage;
  theme: 'light' | 'dark' | 'system';
  customSystemPrompt?: string;
  featureConfigs: FeatureConfigs;
  wikiResearchEnabled: boolean;

  setLanguage: (lang: AppLanguage) => void;
  setOutputLanguage: (lang: AppLanguage) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setFeatureConfig: (feature: FeatureTab, config: Partial<ProviderConfig>) => void;
  getFeatureConfig: (feature: FeatureTab) => ProviderConfig;
  setSystemPrompt: (prompt: string) => void;
  setWikiResearchEnabled: (enabled: boolean) => void;
  hydrateFromServer: () => Promise<void>;
  resetLocalData: (preserveLanguage?: boolean) => void;
}

const DEFAULT_PROVIDER = 'openrouter';

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

const defaultConfig: ProviderConfig = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  temperature: 0.7,
  reasoningEffort: 'low',
};

const getDefaultFeatureConfigs = (model: string = DEFAULT_MODEL): Record<FeatureTab, ProviderConfig> => ({
  generate: { ...defaultConfig, model },
  attack: { ...defaultConfig, model },
  brainstorm: { ...defaultConfig, model, temperature: 0.9 },
  factoids: { ...defaultConfig, model, temperature: 0.3 },
  ask: { ...defaultConfig, model },
  sparring: { ...defaultConfig, model },
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeModelId(value: unknown, fallback: string = DEFAULT_MODEL): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const model = value.trim();
  if (isAutoModelSelection(model)) return model;
  if (getModelCatalogEntry(model)) return model;
  return LEGACY_MODEL_SUCCESSORS[model] ?? DEFAULT_MODEL;
}

function normalizeFeatureConfig(
  value: unknown,
  fallback: ProviderConfig,
  preserveLocalMock = false,
  allowProModels = true,
): ProviderConfig {
  const candidate = asRecord(value);
  const isLocalMock = preserveLocalMock && candidate?.provider === 'mock' && candidate?.model === 'local';
  const model = normalizeModelId(candidate?.model, fallback.model);
  const temperature = typeof candidate?.temperature === 'number' && Number.isFinite(candidate.temperature)
    ? candidate.temperature
    : fallback.temperature;
  const reasoningEffort = isReasoningEffort(candidate?.reasoningEffort)
    ? candidate.reasoningEffort
    : fallback.reasoningEffort ?? 'low';

  return {
    provider: isLocalMock ? 'mock' : DEFAULT_PROVIDER,
    model: isLocalMock
      ? 'local'
      : !allowProModels && model === AUTO_PRO
        ? AUTO_FAST
        : !allowProModels && getModelCatalogEntry(model)?.isProOnly
          ? DEFAULT_MODEL
          : model,
    temperature,
    reasoningEffort,
  };
}

function normalizeFeatureConfigs(
  configs: unknown,
  preserveLocalMock = false,
  allowProModels = true,
  fallbackModel: string = DEFAULT_MODEL,
): Record<FeatureTab, ProviderConfig> {
  const defaults = getDefaultFeatureConfigs(fallbackModel);
  const saved = asRecord(configs);
  if (!saved) return defaults;

  return Object.fromEntries((Object.keys(defaults) as FeatureTab[]).map((feature) => {
    return [feature, normalizeFeatureConfig(saved[feature], defaults[feature], preserveLocalMock, allowProModels)];
  })) as Record<FeatureTab, ProviderConfig>;
}

function featureConfigsAreCanonical(value: unknown, expected: Record<FeatureTab, ProviderConfig>): boolean {
  const saved = asRecord(value);
  const features = Object.keys(expected) as FeatureTab[];
  if (!saved || Object.keys(saved).length !== features.length) return false;

  const allowedKeys = new Set(['provider', 'model', 'temperature', 'reasoningEffort']);
  return features.every((feature) => {
    const config = asRecord(saved[feature]);
    if (!config) return false;
    const target = expected[feature];
    return Object.keys(config).every((key) => allowedKeys.has(key))
      && config.provider === target.provider
      && config.model === target.model
      && config.temperature === target.temperature
      && config.reasoningEffort === target.reasoningEffort;
  });
}

async function canAccessProModels(settings: Record<string, unknown>): Promise<boolean | null> {
  const tier = settings.subscription_tier;
  const graceEnd = typeof settings.grace_period_ends_at === 'string'
    ? new Date(settings.grace_period_ends_at)
    : null;
  if ((tier === 'pro' || tier === 'legacy_free') && graceEnd && graceEnd > new Date()) return true;
  if (tier !== 'pro') return false;

  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId);
  if (error) return null;
  return Boolean(data?.some((subscription) =>
    (subscription.status === 'active' || subscription.status === 'trialing')
    && subscription.current_period_end
    && new Date(subscription.current_period_end) > new Date()
  ));
}

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

async function upsertSettings(payload: {
  language: string;
  output_language: string;
  theme: string;
  feature_configs: Record<string, ProviderConfig>;
  custom_system_prompt: string | null;
}) {
  const userId = await getUserId();
  if (!userId) return;
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    ...payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) {
    console.warn('[SettingsStore] Failed to persist settings:', error.message);
  }
}

async function persistMigratedFeatureConfigs(featureConfigs: Record<FeatureTab, ProviderConfig>) {
  const userId = await getUserId();
  if (!userId) return;
  const { error } = await supabase
    .from('user_settings')
    .update({ feature_configs: featureConfigs, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) {
    console.warn('[SettingsStore] Failed to persist migrated settings:', error.message);
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      language: 'en',
      outputLanguage: 'en',
      theme: 'system',
      customSystemPrompt: undefined as string | undefined,
      featureConfigs: getDefaultFeatureConfigs(),
      wikiResearchEnabled: false,

      setLanguage: (language) => {
        set({ language });
        void applyAppLanguage(language);
        void upsertSettings({
          language,
          output_language: get().outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setOutputLanguage: (outputLanguage) => {
        set({ outputLanguage });
        void upsertSettings({
          language: get().language,
          output_language: outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setTheme: (theme) => {
        set({ theme });
        void upsertSettings({
          language: get().language,
          output_language: get().outputLanguage,
          theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setSystemPrompt: (prompt) => {
        set({ customSystemPrompt: prompt });
        void upsertSettings({
          language: get().language,
          output_language: get().outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: prompt || null,
        });
      },
      setWikiResearchEnabled: (enabled) => {
        set({ wikiResearchEnabled: enabled });
      },

      setFeatureConfig: (feature, config) => {
        set((state) => ({
          featureConfigs: {
            ...state.featureConfigs,
            [feature]: normalizeFeatureConfig(
              { ...state.featureConfigs[feature], ...config },
              getDefaultFeatureConfigs()[feature],
            ),
          },
        }));
        void upsertSettings({
          language: get().language,
          output_language: get().outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },

      getFeatureConfig: (feature) => {
        const config = get().featureConfigs[feature];
        if (config) return config;
        const defaults = getDefaultFeatureConfigs();
        return defaults[feature];
      },

      hydrateFromServer: async () => {
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .single();
        if (error || !data) return;

        const allowProModels = await canAccessProModels(data);
        if (allowProModels === null) return;
        const mergedConfigs = normalizeFeatureConfigs(
          data.feature_configs,
          false,
          allowProModels,
          allowProModels ? DEFAULT_PRO_MODEL : DEFAULT_MODEL,
        );
        const configsNeedMigration = !featureConfigsAreCanonical(data.feature_configs, mergedConfigs);

        const language = isAppLanguage(data.language) ? data.language : 'en';
        const outputLanguage = isAppLanguage(data.output_language) ? data.output_language : 'en';
        const theme = (data.theme as 'light' | 'dark' | 'system') || 'system';
        const customSystemPrompt = data.custom_system_prompt || undefined;
        await applyAppLanguage(language);
        set({
          language,
          outputLanguage,
          theme,
          featureConfigs: mergedConfigs,
          customSystemPrompt,
          wikiResearchEnabled: get().wikiResearchEnabled,
        });
        if (configsNeedMigration) {
          await persistMigratedFeatureConfigs(mergedConfigs);
        }
      },
      resetLocalData: (preserveLanguage = false) => {
        const language = preserveLanguage ? get().language : 'en';
        set({
          language,
          outputLanguage: 'en',
          theme: 'system',
          customSystemPrompt: undefined,
          featureConfigs: getDefaultFeatureConfigs(),
          wikiResearchEnabled: false,
        });
        void applyAppLanguage(language);
      },
    }),
    {
      name: 'debate-trainer-settings',
      version: 2,
      migrate: (persistedState: unknown, version) => {
        const saved = asRecord(persistedState);
        if (!saved) return persistedState;
        const featureConfigs = normalizeFeatureConfigs(saved.featureConfigs, true);
        if (version < 2) {
          for (const config of Object.values(featureConfigs)) {
            if (config.model === 'z-ai/glm-5.3-flash') config.model = DEFAULT_MODEL;
          }
        }
        return {
          ...saved,
          language: isAppLanguage(saved.language) ? saved.language : 'en',
          outputLanguage: isAppLanguage(saved.outputLanguage) ? saved.outputLanguage : 'en',
          featureConfigs,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.featureConfigs = normalizeFeatureConfigs(state.featureConfigs, true);
        if (!isAppLanguage(state.language)) state.language = 'en';
        if (!isAppLanguage(state.outputLanguage)) state.outputLanguage = 'en';
        if (!state.theme) state.theme = 'system';
        if (typeof state.wikiResearchEnabled !== 'boolean') state.wikiResearchEnabled = false;
        void applyAppLanguage(state.language);
      },
    }
  )
);
