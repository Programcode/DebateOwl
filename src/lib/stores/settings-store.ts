import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';
import {
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
} from '../ai/providers/types';
import type { ProviderConfig } from '../ai/providers/types';
import {
  getModelCatalogEntry,
  isReasoningEffort,
} from '../../../supabase/functions/_shared/model-catalog';
import { supabase } from '@/lib/supabase/client';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring';
type CoreFeatureTab = Exclude<FeatureTab, 'sparring'>;
type FeatureConfigs = Record<CoreFeatureTab, ProviderConfig> & Partial<Record<'sparring', ProviderConfig>>;

interface SettingsState {
  language: 'en' | 'es' | 'hu';
  outputLanguage: 'en' | 'es' | 'hu';
  theme: 'light' | 'dark' | 'system';
  customSystemPrompt?: string;
  featureConfigs: FeatureConfigs;
  wikiResearchEnabled: boolean;

  setLanguage: (lang: 'en' | 'es' | 'hu') => void;
  setOutputLanguage: (lang: 'en' | 'es' | 'hu') => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setFeatureConfig: (feature: FeatureTab, config: Partial<ProviderConfig>) => void;
  getFeatureConfig: (feature: FeatureTab) => ProviderConfig;
  setSystemPrompt: (prompt: string) => void;
  setWikiResearchEnabled: (enabled: boolean) => void;
  hydrateFromServer: () => Promise<void>;
  resetLocalData: () => void;
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

const getDefaultFeatureConfigs = (): Record<FeatureTab, ProviderConfig> => ({
  generate: { ...defaultConfig },
  attack: { ...defaultConfig },
  brainstorm: { ...defaultConfig, temperature: 0.9 },
  factoids: { ...defaultConfig, temperature: 0.3 },
  ask: { ...defaultConfig },
  sparring: { ...defaultConfig },
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeModelId(value: unknown, fallback: string = DEFAULT_MODEL): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const model = value.trim();
  if (getModelCatalogEntry(model)) return model;
  return LEGACY_MODEL_SUCCESSORS[model] ?? DEFAULT_MODEL;
}

function normalizeFeatureConfig(value: unknown, fallback: ProviderConfig): ProviderConfig {
  const candidate = asRecord(value);
  const temperature = typeof candidate?.temperature === 'number' && Number.isFinite(candidate.temperature)
    ? candidate.temperature
    : fallback.temperature;
  const reasoningEffort = isReasoningEffort(candidate?.reasoningEffort)
    ? candidate.reasoningEffort
    : fallback.reasoningEffort ?? 'low';

  return {
    provider: DEFAULT_PROVIDER,
    model: normalizeModelId(candidate?.model, fallback.model),
    temperature,
    reasoningEffort,
  };
}

function normalizeFeatureConfigs(configs: unknown): Record<FeatureTab, ProviderConfig> {
  const defaults = getDefaultFeatureConfigs();
  const saved = asRecord(configs);
  if (!saved) return defaults;

  return Object.fromEntries((Object.keys(defaults) as FeatureTab[]).map((feature) => {
    return [feature, normalizeFeatureConfig(saved[feature], defaults[feature])];
  })) as Record<FeatureTab, ProviderConfig>;
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
        void i18n.changeLanguage(language);
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

        const mergedConfigs = normalizeFeatureConfigs(data.feature_configs);

        const language = (data.language as 'en' | 'es' | 'hu') || 'en';
        await i18n.changeLanguage(language);
        set({
          language,
          outputLanguage: (data.output_language as 'en' | 'es' | 'hu') || get().outputLanguage || 'en',
          theme: (data.theme as 'light' | 'dark' | 'system') || 'system',
          featureConfigs: mergedConfigs,
          customSystemPrompt: data.custom_system_prompt || undefined,
          wikiResearchEnabled: get().wikiResearchEnabled,
        });
      },
      resetLocalData: () => {
        set({
          language: 'en',
          outputLanguage: 'en',
          theme: 'system',
          customSystemPrompt: undefined,
          featureConfigs: getDefaultFeatureConfigs(),
          wikiResearchEnabled: false,
        });
      },
    }),
    {
      name: 'debate-trainer-settings',
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.featureConfigs = normalizeFeatureConfigs(state.featureConfigs);
        if (!state.language) state.language = 'en';
        if (!state.outputLanguage) state.outputLanguage = 'en';
        if (!state.theme) state.theme = 'system';
        if (typeof state.wikiResearchEnabled !== 'boolean') state.wikiResearchEnabled = false;
        void i18n.changeLanguage(state.language);
      },
    }
  )
);
