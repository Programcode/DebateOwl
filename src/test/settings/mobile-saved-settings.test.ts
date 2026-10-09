import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultFeatureConfigs } from '@debatelab/core/ai/feature-configs';
import { resetMockState, setMockTableResponse, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', async () => ({ supabase: (await import('@/test/mocks/supabase')).supabaseMock }));

const { useSettingsStore } = await import('@/lib/stores/settings-store');

/** Every update the store sent to Supabase. */
const updates = () => supabaseMock.from.mock.results.flatMap((result) => result.value.update.mock.calls);

// The iOS app saves a setting with the website's default feature_configs when
// the row has none, because the website treats an empty feature_configs as a
// row that was never saved and replaces its language and theme.
describe('settings saved by the iOS app', () => {
  beforeEach(() => {
    resetMockState();
    useSettingsStore.setState({ language: 'en', outputLanguage: 'en', theme: 'light' });
  });

  it('keeps the language and theme the app saved, without rewriting the row', async () => {
    setMockTableResponse('user_settings', {
      single: {
        language: 'hu',
        output_language: 'es',
        theme: 'dark',
        subscription_tier: 'trial',
        feature_configs: getDefaultFeatureConfigs(),
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    expect([state.language, state.outputLanguage, state.theme]).toEqual(['hu', 'es', 'dark']);
    expect(updates()).toEqual([]);
  });

  it('replaces them when feature_configs was left empty', async () => {
    setMockTableResponse('user_settings', {
      single: { language: 'hu', output_language: 'es', theme: 'dark', subscription_tier: 'trial', feature_configs: {} },
    });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    expect([state.language, state.outputLanguage, state.theme]).toEqual(['en', 'en', 'light']);
  });
});
