/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockState, setMockTableResponse, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', () => ({ supabase: supabaseMock }));

import { useSettingsStore } from '@/lib/stores/settings-store';
import i18n from '@/i18n';

describe('settings-store additional branches', () => {
  beforeEach(() => {
    resetMockState();
    localStorage.clear();
    useSettingsStore.getState().resetLocalData();
  });

  it('setLanguage updates state to es', () => {
    useSettingsStore.getState().setLanguage('es');
    expect(useSettingsStore.getState().language).toBe('es');
  });

  it('setLanguage updates state to hu', () => {
    useSettingsStore.getState().setLanguage('hu');
    expect(useSettingsStore.getState().language).toBe('hu');
  });

  it('setLanguage calls i18n.changeLanguage', async () => {
    const spy = vi.spyOn(i18n, 'changeLanguage');
    useSettingsStore.getState().setLanguage('es');
    expect(spy).toHaveBeenCalledWith('es');
    spy.mockRestore();
  });

  it('setTheme updates state to dark', () => {
    useSettingsStore.getState().setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('setTheme updates state to light', () => {
    useSettingsStore.getState().setTheme('light');
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('setFeatureConfig merges correctly', () => {
    useSettingsStore.getState().setFeatureConfig('generate', { model: 'anthropic/claude-sonnet-5', provider: 'openrouter' });
    const config = useSettingsStore.getState().featureConfigs.generate;
    expect(config.model).toBe('z-ai/glm-5.3-flash');
    expect(config.provider).toBe('openrouter');
    expect(config.temperature).toBe(0.7);
  });

  it('setFeatureConfig preserves other features', () => {
    useSettingsStore.getState().setFeatureConfig('attack', { temperature: 0.5 });
    expect(useSettingsStore.getState().featureConfigs.generate.temperature).toBe(0.7);
    expect(useSettingsStore.getState().featureConfigs.attack.temperature).toBe(0.5);
  });

  it('getFeatureConfig returns config for known feature', () => {
    const config = useSettingsStore.getState().getFeatureConfig('generate');
    expect(config.provider).toBe('openrouter');
    expect(config.model).toBe('z-ai/glm-5.3-flash');
  });

  it('getFeatureConfig returns defaults for unknown feature', () => {
    useSettingsStore.setState({ featureConfigs: {} as any });
    const config = useSettingsStore.getState().getFeatureConfig('generate');
    expect(config).toBeDefined();
    expect(config.provider).toBe('openrouter');
  });

  it('resetLocalData resets language', () => {
    useSettingsStore.getState().setLanguage('hu');
    useSettingsStore.getState().resetLocalData();
    expect(useSettingsStore.getState().language).toBe('en');
  });

  it('resetLocalData resets theme', () => {
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().resetLocalData();
    expect(useSettingsStore.getState().theme).toBe('system');
  });

  it('resetLocalData resets featureConfigs', () => {
    useSettingsStore.getState().setFeatureConfig('generate', { model: 'openai/gpt-5.6-terra' });
    useSettingsStore.getState().resetLocalData();
    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe('z-ai/glm-5.3-flash');
  });

  it('resetLocalData resets customSystemPrompt', () => {
    useSettingsStore.getState().setSystemPrompt('custom');
    useSettingsStore.getState().resetLocalData();
    expect(useSettingsStore.getState().customSystemPrompt).toBeUndefined();
  });

  it('resetLocalData resets wikiResearchEnabled', () => {
    useSettingsStore.getState().setWikiResearchEnabled(true);
    useSettingsStore.getState().resetLocalData();
    expect(useSettingsStore.getState().wikiResearchEnabled).toBe(false);
  });

  it('hydrateFromServer handles missing data gracefully', async () => {
    setMockTableResponse('user_settings', { single: null });
    const prevTheme = useSettingsStore.getState().theme;
    await useSettingsStore.getState().hydrateFromServer();
    expect(useSettingsStore.getState().theme).toBe(prevTheme);
  });
});
