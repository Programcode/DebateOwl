/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockState, setMockTableResponse, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', () => ({ supabase: supabaseMock }));

import { useSettingsStore } from '@/lib/stores/settings-store';

describe('settings-store branch coverage', () => {
  beforeEach(() => {
    resetMockState();
    localStorage.clear();
    useSettingsStore.getState().resetLocalData();
  });

  it('hydrateFromServer returns early when no server row exists', async () => {
    setMockTableResponse('user_settings', { single: null });

    useSettingsStore.setState({ theme: 'dark' });
    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('hydrateFromServer applies fallback values when server fields are empty', async () => {
    setMockTableResponse('user_settings', {
      single: {
        language: undefined,
        theme: undefined,
        custom_system_prompt: '',
        feature_configs: undefined,
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    expect(state.language).toBe('en');
    expect(state.theme).toBe('system');
    expect(state.customSystemPrompt).toBeUndefined();
    expect(state.featureConfigs.generate.model).toBe('openai/gpt-5.6-luna');
  });

  it('normalizes persisted state in onRehydrateStorage callback', () => {
    const onRehydrateStorage = useSettingsStore.persist.getOptions().onRehydrateStorage;
    expect(onRehydrateStorage).toBeTypeOf('function');

    const afterRehydrate = onRehydrateStorage?.(useSettingsStore.getState());
    if (!afterRehydrate) throw new Error('Expected a rehydration callback');

    const partialState = {
      featureConfigs: undefined,
      language: '',
      theme: '',
      wikiResearchEnabled: undefined,
    } as any;

    afterRehydrate(partialState);

    expect(partialState.featureConfigs.generate).toBeDefined();
    expect(partialState.language).toBe('en');
    expect(partialState.theme).toBe('system');
    expect(partialState.wikiResearchEnabled).toBe(false);
  });

  it('canonicalizes legacy local configs and removes client credentials', () => {
    const onRehydrateStorage = useSettingsStore.persist.getOptions().onRehydrateStorage;
    const afterRehydrate = onRehydrateStorage?.(useSettingsStore.getState());
    if (!afterRehydrate) throw new Error('Expected a rehydration callback');

    const partialState = {
      featureConfigs: {
        generate: {
          provider: 'google',
          model: 'gemini-3-flash-preview',
          temperature: 0.3,
          reasoningEffort: 'medium',
          apiKey: 'legacy-secret',
          baseUrl: 'https://legacy.example.test',
        },
      },
    } as any;

    afterRehydrate(partialState);

    expect(partialState.featureConfigs.generate).toMatchObject({
      provider: 'openrouter',
      model: 'google/gemini-3.8-flash',
      temperature: 0.3,
      reasoningEffort: 'medium',
    });
    expect(partialState.featureConfigs.generate).not.toHaveProperty('apiKey');
    expect(partialState.featureConfigs.generate).not.toHaveProperty('baseUrl');
  });

  it('preserves the local mock fixture during local rehydration', () => {
    const onRehydrateStorage = useSettingsStore.persist.getOptions().onRehydrateStorage;
    const afterRehydrate = onRehydrateStorage?.(useSettingsStore.getState());
    if (!afterRehydrate) throw new Error('Expected a rehydration callback');

    const partialState = {
      featureConfigs: {
        generate: { provider: 'mock', model: 'local', temperature: 0.7 },
      },
    } as any;

    afterRehydrate(partialState);

    expect(partialState.featureConfigs.generate).toMatchObject({
      provider: 'mock',
      model: 'local',
      reasoningEffort: 'low',
    });
  });
});
