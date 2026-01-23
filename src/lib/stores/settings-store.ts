// src/lib/stores/settings-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderConfig } from '../ai/providers/types';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask';

interface SettingsState {
  // Global settings
  language: 'en' | 'es';
  theme: 'light' | 'dark' | 'system';
  
  // Per-feature AI settings
  featureConfigs: Record<FeatureTab, ProviderConfig>;
  
  // Actions
  setLanguage: (lang: 'en' | 'es') => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setFeatureConfig: (feature: FeatureTab, config: Partial<ProviderConfig>) => void;
  getFeatureConfig: (feature: FeatureTab) => ProviderConfig;
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
      featureConfigs: {
        generate: { ...defaultConfig },
        attack: { ...defaultConfig },
        brainstorm: { ...defaultConfig, temperature: 0.9 },
        factoids: { ...defaultConfig, temperature: 0.3 },
        ask: { ...defaultConfig },
      },

      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      
      setFeatureConfig: (feature, config) => set((state) => ({
        featureConfigs: {
          ...state.featureConfigs,
          [feature]: { ...state.featureConfigs[feature], ...config },
        },
      })),
      
      getFeatureConfig: (feature) => get().featureConfigs[feature],
    }),
    {
      name: 'debate-trainer-settings',
    }
  )
);
