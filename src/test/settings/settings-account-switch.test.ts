import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockState, setMockAuthUser, setMockTableResponse, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', async () => ({ supabase: (await import('@/test/mocks/supabase')).supabaseMock }));

const { useSettingsStore } = await import('@/lib/stores/settings-store');

/** Every update the store sent to Supabase. */
const updates = () => supabaseMock.from.mock.results.flatMap((result) => result.value.update.mock.calls);

// AuthProvider resets the store and hydrates the next account when the user
// switches accounts. A hydration still waiting on the previous account's plan
// must not land in the next account's store or row.
describe('settings hydration across an account switch', () => {
  beforeEach(() => {
    resetMockState();
    useSettingsStore.getState().resetLocalData();
  });

  it("drops the previous account's settings when its plan arrives after the switch", async () => {
    setMockAuthUser({ id: 'user_a' });
    // A legacy model, so hydration would migrate and save the configs.
    setMockTableResponse('user_settings', {
      single: {
        language: 'es',
        output_language: 'es',
        theme: 'dark',
        custom_system_prompt: 'Prompt of A',
        feature_configs: { generate: { model: 'gpt-4o' } },
      },
    });
    let resolvePlan!: (value: unknown) => void;
    supabaseMock.rpc.mockImplementationOnce(() => new Promise((resolve) => { resolvePlan = resolve; }));

    const hydratingA = useSettingsStore.getState().hydrateFromServer();
    await vi.waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalled());

    // B signs in: the store resets and B writes a prompt of their own.
    useSettingsStore.getState().resetLocalData();
    setMockAuthUser({ id: 'user_b' });
    supabaseMock.from.mockClear();
    useSettingsStore.setState({ customSystemPrompt: 'Prompt of B' });

    resolvePlan({ data: [{ tier: 'trial', daily_limit: 5, can_access_pro_models: false }], error: null });
    await hydratingA;

    expect(updates()).toEqual([]);
    const state = useSettingsStore.getState();
    expect(state.customSystemPrompt).toBe('Prompt of B');
    expect([state.language, state.theme]).toEqual(['en', 'system']);
  });
});
