import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyAppLanguage } from '@/i18n';
import { isAppLanguage, type AppLanguage } from '@/lib/languages';
import { getDefaultFeatureConfigs, type FeatureTab } from '@debatelab/core/ai/feature-configs';
import { readEntitlement } from '@debatelab/core/supabase/entitlement';
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

export type { FeatureTab };
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
  allowProModels = true,
): ProviderConfig {
  const candidate = asRecord(value);
  const model = normalizeModelId(candidate?.model, fallback.model);
  const temperature = typeof candidate?.temperature === 'number' && Number.isFinite(candidate.temperature)
    ? candidate.temperature
    : fallback.temperature;
  const reasoningEffort = isReasoningEffort(candidate?.reasoningEffort)
    ? candidate.reasoningEffort
    : fallback.reasoningEffort ?? 'low';

  return {
    provider: DEFAULT_PROVIDER,
    model: !allowProModels && model === AUTO_PRO
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

/** Whether the plan includes Pro models, or null when it can't be read. */
async function canAccessProModels(userId: string): Promise<boolean | null> {
  return (await readEntitlement(supabase, userId))?.canAccessProModels ?? null;
}

// Bumped by every reset and every hydration. A hydration that started for an
// earlier account, or was overtaken by a newer one, applies and saves nothing.
let hydrationGeneration = 0;

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

// The auth trigger provisions every settings row, and clients may only UPDATE
// the user-editable columns. An upsert needs INSERT and is always denied.
type SettingsPayload = {
  language: string;
  output_language: string;
  theme: string;
  feature_configs: Record<string, ProviderConfig>;
  custom_system_prompt: string | null;
};

async function updateSettings(payload: SettingsPayload) {
  const userId = await getUserId();
  if (!userId) return;
  await updateSettingsFor(userId, payload);
}

async function updateSettingsFor(userId: string, payload: SettingsPayload) {
  const { error } = await supabase.from('user_settings').update({
    ...payload,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (error) {
    console.warn('[SettingsStore] Failed to persist settings:', error.message);
  }
}

async function persistMigratedFeatureConfigs(userId: string, featureConfigs: Record<FeatureTab, ProviderConfig>) {
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
        void updateSettings({
          language,
          output_language: get().outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setOutputLanguage: (outputLanguage) => {
        set({ outputLanguage });
        void updateSettings({
          language: get().language,
          output_language: outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setTheme: (theme) => {
        set({ theme });
        void updateSettings({
          language: get().language,
          output_language: get().outputLanguage,
          theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setSystemPrompt: (prompt) => {
        set({ customSystemPrompt: prompt });
        void updateSettings({
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
        void updateSettings({
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
        // The account is read once, at the start; every later step checks the
        // generation, so an account switch during an await drops this run.
        const generation = ++hydrationGeneration;
        const current = () => generation === hydrationGeneration;
        const userId = await getUserId();
        if (!userId || !current()) return;
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .single();
        if (error || !data || !current()) return;

        const allowProModels = await canAccessProModels(userId);
        if (allowProModels === null || !current()) return;
        const mergedConfigs = normalizeFeatureConfigs(
          data.feature_configs,
          allowProModels,
          allowProModels ? DEFAULT_PRO_MODEL : DEFAULT_MODEL,
        );
        const configsNeedMigration = !featureConfigsAreCanonical(data.feature_configs, mergedConfigs);
        // The sign-up trigger provisions the row with defaults and only this client
        // fills in feature_configs, so an empty object means it was never saved.
        // Keep what the student already chose instead of the defaults.
        const savedConfigs = asRecord(data.feature_configs);
        const neverSaved = savedConfigs !== null && Object.keys(savedConfigs).length === 0;

        const language = neverSaved ? get().language : isAppLanguage(data.language) ? data.language : 'en';
        const outputLanguage = neverSaved ? get().outputLanguage : isAppLanguage(data.output_language) ? data.output_language : 'en';
        const theme = neverSaved ? get().theme : (data.theme as 'light' | 'dark' | 'system') || 'system';
        const customSystemPrompt = data.custom_system_prompt || undefined;
        await applyAppLanguage(language);
        if (!current()) return;
        set({
          language,
          outputLanguage,
          theme,
          featureConfigs: mergedConfigs,
          customSystemPrompt,
          wikiResearchEnabled: get().wikiResearchEnabled,
        });
        if (neverSaved) {
          await updateSettingsFor(userId, {
            language,
            output_language: outputLanguage,
            theme,
            feature_configs: mergedConfigs,
            custom_system_prompt: customSystemPrompt ?? null,
          });
        } else if (configsNeedMigration) {
          await persistMigratedFeatureConfigs(userId, mergedConfigs);
        }
      },
      resetLocalData: (preserveLanguage = false) => {
        hydrationGeneration += 1;
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
        const featureConfigs = normalizeFeatureConfigs(saved.featureConfigs);
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
        state.featureConfigs = normalizeFeatureConfigs(state.featureConfigs);
        if (!isAppLanguage(state.language)) state.language = 'en';
        if (!isAppLanguage(state.outputLanguage)) state.outputLanguage = 'en';
        if (!state.theme) state.theme = 'system';
        if (typeof state.wikiResearchEnabled !== 'boolean') state.wikiResearchEnabled = false;
        void applyAppLanguage(state.language);
      },
    }
  )
);
