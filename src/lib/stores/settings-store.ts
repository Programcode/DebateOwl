import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderConfig } from '../ai/providers/types';
import { supabase } from '@/lib/supabase/client';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask';

interface SettingsState {
  language: 'en' | 'es';
  theme: 'light' | 'dark' | 'system';
  customSystemPrompt?: string;
  featureConfigs: Record<FeatureTab, ProviderConfig>;

  setLanguage: (lang: 'en' | 'es') => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setFeatureConfig: (feature: FeatureTab, config: Partial<ProviderConfig>) => void;
  getFeatureConfig: (feature: FeatureTab) => ProviderConfig;
  setSystemPrompt: (prompt: string) => void;
  hydrateFromServer: () => Promise<void>;
  resetLocalData: () => void;
}

const defaultConfig: ProviderConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
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
      theme: 'system',
      customSystemPrompt: undefined,
      featureConfigs: getDefaultFeatureConfigs(),

      setLanguage: (language) => {
        set({ language });
        void upsertSettings({
          language,
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
          language: (data.language as 'en' | 'es') || 'en',
          theme: (data.theme as 'light' | 'dark' | 'system') || 'system',
          featureConfigs: mergedConfigs,
          customSystemPrompt: data.custom_system_prompt || undefined,
        });
      },
      resetLocalData: () => {
        set({
          language: 'en',
          theme: 'system',
          customSystemPrompt: undefined,
          featureConfigs: getDefaultFeatureConfigs(),
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
        if (!state.theme) state.theme = 'system';
      },
    }
  )
);
