import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';
import type { ProviderConfig } from '../ai/providers/types';
import { supabase } from '@/lib/supabase/client';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring';

interface SettingsState {
  language: 'en' | 'es' | 'hu';
  outputLanguage: 'en' | 'es' | 'hu';
  theme: 'light' | 'dark' | 'system';
  customSystemPrompt?: string;
  featureConfigs: Record<FeatureTab, ProviderConfig>;
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

const defaultConfig: ProviderConfig = {
  provider: 'google',
  model: 'gemini-3-flash-preview',
  temperature: 0.7,
};

const getDefaultFeatureConfigs = (): Record<FeatureTab, ProviderConfig> => ({
  generate: { ...defaultConfig },
  attack: { ...defaultConfig },
  brainstorm: { ...defaultConfig, temperature: 0.9 },
  factoids: { ...defaultConfig, temperature: 0.3 },
  ask: { ...defaultConfig },
  sparring: { ...defaultConfig, temperature: 0.75 },
});

function normalizeFeatureConfigs(configs: unknown): Record<FeatureTab, ProviderConfig> {
  const defaults = getDefaultFeatureConfigs();
  if (!configs || typeof configs !== 'object' || Array.isArray(configs)) return defaults;

  const saved = configs as Record<string, unknown>;
  return Object.fromEntries((Object.keys(defaults) as FeatureTab[]).map((feature) => {
    const value = saved[feature];
    const candidate = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Partial<ProviderConfig>
      : {};
    const fallback = defaults[feature];
    return [feature, {
      ...fallback,
      ...(typeof candidate.provider === 'string' ? { provider: candidate.provider } : {}),
      ...(typeof candidate.model === 'string' ? { model: candidate.model } : {}),
      ...(typeof candidate.temperature === 'number' ? { temperature: candidate.temperature } : {}),
      ...(typeof candidate.apiKey === 'string' ? { apiKey: candidate.apiKey } : {}),
      ...(typeof candidate.baseUrl === 'string' ? { baseUrl: candidate.baseUrl } : {}),
    }];
  })) as Record<FeatureTab, ProviderConfig>;
}

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

async function persistSettings(payload: {
  language: string;
  output_language: string;
  theme: string;
  feature_configs: Record<string, ProviderConfig>;
  custom_system_prompt: string | null;
}) {
  const userId = await getUserId();
  if (!userId) return;

  // user_settings is provisioned by the auth trigger. Security hardening
  // intentionally revoked authenticated INSERT/DELETE and permits only selected
  // preference columns to be updated, so browser persistence must use UPDATE
  // rather than UPSERT (which requires INSERT privilege even on conflict).
  const { error } = await supabase
    .from('user_settings')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
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
        void persistSettings({
          language,
          output_language: get().outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setOutputLanguage: (outputLanguage) => {
        set({ outputLanguage });
        void persistSettings({
          language: get().language,
          output_language: outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setTheme: (theme) => {
        set({ theme });
        void persistSettings({
          language: get().language,
          output_language: get().outputLanguage,
          theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setSystemPrompt: (prompt) => {
        set({ customSystemPrompt: prompt });
        void persistSettings({
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
            [feature]: { ...state.featureConfigs[feature], ...config },
          },
        }));
        void persistSettings({
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