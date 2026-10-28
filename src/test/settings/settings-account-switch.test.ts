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
    // The plan's Stripe rows are held back until B has signed in.
    let resolvePlan!: (value: unknown) => void;
    const planPending = new Promise((resolve) => { resolvePlan = resolve; });
    const from = supabaseMock.from.getMockImplementation()!;
    supabaseMock.from.mockImplementation((table: string) => table === 'subscriptions'
      ? { ...from(table), select: vi.fn(() => ({ eq: vi.fn(() => planPending) })) } as unknown as ReturnType<typeof from>
      : from(table));

    const hydratingA = useSettingsStore.getState().hydrateFromServer();
    await vi.waitFor(() => expect(supabaseMock.from).toHaveBeenCalledWith('subscriptions'));

    // B signs in: the store resets and B writes a prompt of their own.
    useSettingsStore.getState().resetLocalData();
    setMockAuthUser({ id: 'user_b' });
    supabaseMock.from.mockClear();
    useSettingsStore.setState({ customSystemPrompt: 'Prompt of B' });

    resolvePlan({ data: [], error: null });
    await hydratingA;
    supabaseMock.from.mockImplementation(from);

    expect(updates()).toEqual([]);
    const state = useSettingsStore.getState();
    expect(state.customSystemPrompt).toBe('Prompt of B');
    expect([state.language, state.theme]).toEqual(['en', 'light']);
  });
});
