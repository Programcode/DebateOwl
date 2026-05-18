import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';
import type { ProviderConfig } from '../ai/providers/types';
import { supabase } from '@/lib/supabase/client';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask';

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
});

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

async function upsertSettings(payload: {
  language: string;
  theme: string;
  feature_configs: Record<string, ProviderConfig>;
  custom_system_prompt: string | null;
}) {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('user_settings').upsert({
    user_id: userId,
    ...payload,
    updated_at: new Date().toISOString(),
  });
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
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setOutputLanguage: (outputLanguage) => {
        set({ outputLanguage });
        void upsertSettings({
          language: get().language,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setTheme: (theme) => {
        set({ theme });
        void upsertSettings({
          language: get().language,
          theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setSystemPrompt: (prompt) => {
        set({ customSystemPrompt: prompt });
        void upsertSettings({
          language: get().language,
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
        void upsertSettings({
          language: get().language,
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

        const defaults = getDefaultFeatureConfigs();
        const serverConfigs = (data.feature_configs as Record<FeatureTab, ProviderConfig>) || {};
        const mergedConfigs = { ...defaults, ...serverConfigs };

        set({
          language: (data.language as 'en' | 'es' | 'hu') || 'en',
          theme: (data.theme as 'light' | 'dark' | 'system') || 'system',
          featureConfigs: mergedConfigs,
          customSystemPrompt: data.custom_system_prompt || undefined,
          wikiResearchEnabled: get().wikiResearchEnabled,
        });
      },
      resetLocalData: () => {
        set({
          language: 'en',
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
        const defaults = getDefaultFeatureConfigs();
        const merged = { ...defaults, ...(state.featureConfigs || {}) };
        state.featureConfigs = merged;
        if (!state.language) state.language = 'en';
        if (!state.outputLanguage) state.outputLanguage = 'en';
        if (!state.theme) state.theme = 'system';
        if (typeof state.wikiResearchEnabled !== 'boolean') state.wikiResearchEnabled = false;
        void i18n.changeLanguage(state.language);
      },
    }
  )
);
