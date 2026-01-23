// src/lib/stores/settings-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderConfig } from '../ai/providers/types';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask';

interface SettingsState {
  // Global settings
  language: 'en' | 'es';
  theme: 'light' | 'dark' | 'system';
  isAdmin: boolean;
  customSystemPrompt?: string;
  
  // API Credentials
  apiKeys: Record<string, string>;

  // Per-feature AI settings
  featureConfigs: Record<FeatureTab, ProviderConfig>;
  
  // Actions
  setLanguage: (lang: 'en' | 'es') => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setApiKey: (providerId: string, key: string) => void;
  setFeatureConfig: (feature: FeatureTab, config: Partial<ProviderConfig>) => void;
  getFeatureConfig: (feature: FeatureTab) => ProviderConfig;
  setAdmin: (isAdmin: boolean) => void;
  setSystemPrompt: (prompt: string) => void;
}

const defaultConfig: ProviderConfig = {
  provider: 'mock',
  model: 'mock-standard',
  temperature: 0.7,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      language: 'en',
      theme: 'system',
      isAdmin: false,
      apiKeys: {},
      featureConfigs: {
        generate: { ...defaultConfig },
        attack: { ...defaultConfig },
        brainstorm: { ...defaultConfig, temperature: 0.9 },
        factoids: { ...defaultConfig, temperature: 0.3 },
        ask: { ...defaultConfig },
      },

      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setAdmin: (isAdmin) => set({ isAdmin }),
      setSystemPrompt: (prompt) => set({ customSystemPrompt: prompt }),
      setApiKey: (providerId, key) => set((state) => ({
        apiKeys: { ...state.apiKeys, [providerId]: key }
      })),
      
      setFeatureConfig: (feature, config) => set((state) => ({
        featureConfigs: {
          ...state.featureConfigs,
          [feature]: { ...state.featureConfigs[feature], ...config },
        },
      })),
      
      getFeatureConfig: (feature) => {
        const config = get().featureConfigs[feature];
        const state = get();
        
        // 1. User-provided key (highest priority)
        let apiKey = state.apiKeys[config.provider];

        // 2. System/Admin key (fallback if Admin is logged in)
        if (!apiKey && state.isAdmin) {
          if (config.provider === 'openai') apiKey = import.meta.env.VITE_OPENAI_API_KEY;
          if (config.provider === 'anthropic') apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
          if (config.provider === 'google') apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
        }

        if (apiKey) {
          return { ...config, apiKey };
        }
        return config;
      },
    }),
    {
      name: 'debate-trainer-settings',
    }
  )
);
