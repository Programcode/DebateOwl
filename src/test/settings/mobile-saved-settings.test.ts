import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultFeatureConfigs } from '@debatelab/core/ai/feature-configs';
import { DEFAULT_PRO_MODEL } from '@debatelab/core/contract/model-catalog';
import { resetMockState, setMockTableResponse, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', async () => ({ supabase: (await import('@/test/mocks/supabase')).supabaseMock }));

const { useSettingsStore } = await import('@/lib/stores/settings-store');

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

/** The billing rows of a plan with or without Pro models (promo Pro, or a running trial). */
const plan = (pro: boolean): Record<string, string | null> => pro
  ? { subscription_tier: 'pro', daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: FUTURE }
  : { subscription_tier: 'trial', daily_limit_override: null, trial_ends_at: FUTURE, grace_period_ends_at: null };

/** The settings row both the billing read and hydration see. */
const settingsRow = (pro: boolean, row: Record<string, unknown>) => {
  setMockTableResponse('user_settings', { select: [plan(pro)], single: { ...plan(pro), ...row } });
};

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
    settingsRow(false, {
      language: 'hu',
      output_language: 'es',
      theme: 'dark',
      feature_configs: getDefaultFeatureConfigs(),
    });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    expect([state.language, state.outputLanguage, state.theme]).toEqual(['hu', 'es', 'dark']);
    expect(updates()).toEqual([]);
  });

  it('keeps the Pro model the app saved for a Pro student, without rewriting the row', async () => {
    // The app picks its defaults from the same plan the website hydrates with.
    settingsRow(true, { language: 'hu', output_language: 'es', theme: 'dark', feature_configs: getDefaultFeatureConfigs(DEFAULT_PRO_MODEL) });

    await useSettingsStore.getState().hydrateFromServer();

    expect(supabaseMock.from).toHaveBeenCalledWith('app_store_subscriptions');
    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe(DEFAULT_PRO_MODEL);
    expect(updates()).toEqual([]);
  });

  it('replaces them when feature_configs was left empty', async () => {
    settingsRow(false, { language: 'hu', output_language: 'es', theme: 'dark', feature_configs: {} });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    expect([state.language, state.outputLanguage, state.theme]).toEqual(['en', 'en', 'light']);
  });
});
