import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultFeatureConfigs } from '@debatelab/core/ai/feature-configs';
import { DEFAULT_PRO_MODEL } from '@debatelab/core/contract/model-catalog';
import { resetMockState, setMockTableResponse, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', async () => ({ supabase: (await import('@/test/mocks/supabase')).supabaseMock }));

const { useSettingsStore } = await import('@/lib/stores/settings-store');

/** effective_entitlement's answer for a plan with or without Pro models. */
const plan = (pro: boolean) => ({
  data: [{ tier: pro ? 'pro' : 'trial', daily_limit: pro ? 50 : 5, can_access_pro_models: pro }],
  error: null as null,
});

/** Every update the store sent to Supabase. */
const updates = () => supabaseMock.from.mock.results.flatMap((result) => result.value.update.mock.calls);

// The iOS app saves a setting with the website's default feature_configs when
// the row has none, because the website treats an empty feature_configs as a
// row that was never saved and replaces its language and theme.
describe('settings saved by the iOS app', () => {
  beforeEach(() => {
    resetMockState();
    supabaseMock.rpc.mockResolvedValue(plan(false));
    useSettingsStore.setState({ language: 'en', outputLanguage: 'en', theme: 'light' });
  });

  it('keeps the language and theme the app saved, without rewriting the row', async () => {
    setMockTableResponse('user_settings', {
      single: {
        language: 'hu',
        output_language: 'es',
        theme: 'dark',
        feature_configs: getDefaultFeatureConfigs(),
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    expect([state.language, state.outputLanguage, state.theme]).toEqual(['hu', 'es', 'dark']);
    expect(updates()).toEqual([]);
  });

  it('keeps the Pro model the app saved for a Pro student, without rewriting the row', async () => {
    // The app picks its defaults from the same plan the website hydrates with.
    supabaseMock.rpc.mockResolvedValue(plan(true));
    setMockTableResponse('user_settings', {
      single: { language: 'hu', output_language: 'es', theme: 'dark', feature_configs: getDefaultFeatureConfigs(DEFAULT_PRO_MODEL) },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(supabaseMock.rpc).toHaveBeenCalledWith('effective_entitlement', { p_user_id: 'user_1' });
    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe(DEFAULT_PRO_MODEL);
    expect(updates()).toEqual([]);
  });

  it('replaces them when feature_configs was left empty', async () => {
    setMockTableResponse('user_settings', {
      single: { language: 'hu', output_language: 'es', theme: 'dark', feature_configs: {} },
    });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    expect([state.language, state.outputLanguage, state.theme]).toEqual(['en', 'en', 'light']);
  });
});
