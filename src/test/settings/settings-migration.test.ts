import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  row: {} as Row,
  subscriptions: [] as Row[],
  onGetUser: undefined as (() => void) | undefined,
}));

vi.mock('@/i18n', () => ({ applyAppLanguage: vi.fn(async () => undefined) }));

vi.mock('@/lib/supabase/client', () => {
  // One user_settings row. An update applies only when every filter matches,
  // like a PostgREST UPDATE ... WHERE.
  const update = (payload: Row) => {
    const filters: Array<(row: Row) => boolean> = [];
    const builder = {
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is(column: string, value: null) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      then(resolve: (result: { error: null }) => void) {
        if (filters.every((matches) => matches(db.row))) db.row = { ...db.row, ...payload };
        resolve({ error: null });
      },
    };
    return builder;
  };
  return {
    supabase: {
      auth: {
        getUser: async () => {
          db.onGetUser?.();
          return { data: { user: { id: 'user-1' } } };
        },
      },
      from: (table: string) => table === 'subscriptions' || table === 'app_store_subscriptions'
        ? { select: () => ({ eq: async () => ({ data: table === 'subscriptions' ? db.subscriptions : [], error: null as null }) }) }
        : {
          select: () => ({ single: async () => ({ data: { ...db.row }, error: null as null }) }),
          update,
        },
    },
  };
});

import { useSettingsStore } from '@/lib/stores/settings-store';

const features = ['generate', 'attack', 'brainstorm', 'factoids', 'ask', 'sparring'] as const;
const savedWithTemperature = Object.fromEntries(features.map((feature) => [
  feature,
  { provider: 'openrouter', model: 'openai/gpt-6-luna', temperature: 0.7, reasoningEffort: 'low' },
]));

describe('settings hydration cleanup', () => {
  beforeEach(() => {
    db.onGetUser = undefined;
    db.subscriptions = [];
    db.row = {
      user_id: 'user-1',
      subscription_tier: 'trial',
      language: 'en',
      output_language: 'en',
      theme: 'system',
      feature_configs: savedWithTemperature,
      updated_at: '2026-10-01T00:00:00.000000+00:00',
    };
  });

  it('rewrites saved configs without temperature', async () => {
    await useSettingsStore.getState().hydrateFromServer();

    const saved = db.row.feature_configs as Record<string, Row>;
    expect(Object.keys(saved.ask)).not.toContain('temperature');
    expect(saved.ask.model).toBe('openai/gpt-6-luna');
  });

  it('does not overwrite a settings save that lands before the cleanup', async () => {
    db.onGetUser = () => {
      db.onGetUser = undefined;
      db.row = {
        ...db.row,
        feature_configs: {
          ...savedWithTemperature,
          ask: { provider: 'openrouter', model: 'meta/muse-spark-1.3-contributor', reasoningEffort: 'low' },
        },
        updated_at: '2026-10-09T17:00:00.000Z',
      };
    };

    await useSettingsStore.getState().hydrateFromServer();

    const saved = db.row.feature_configs as Record<string, Row>;
    expect(saved.ask.model).toBe('meta/muse-spark-1.3-contributor');
  });

  it('lets a ?lang= link opened before hydration win, without saving this device\'s older settings (IN-04)', async () => {
    db.row = { ...db.row, language: 'hu', theme: 'dark' };
    // This device last saw the account with a light theme.
    useSettingsStore.setState({ theme: 'light' });

    useSettingsStore.getState().chooseLinkedLanguage('es');
    await useSettingsStore.getState().hydrateFromServer();

    await vi.waitFor(() => expect(db.row.language).toBe('es'));
    expect(useSettingsStore.getState().language).toBe('es');
    expect(db.row.theme).toBe('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('lets a later switcher choice or a sign-out cancel a ?lang= link (IN-04)', async () => {
    // Opened /hu, then picked English with the switcher before the account loaded.
    useSettingsStore.getState().chooseLinkedLanguage('hu');
    useSettingsStore.getState().setLanguage('en');
    await vi.waitFor(() => expect(db.row.language).toBe('en'));
    await useSettingsStore.getState().hydrateFromServer();
    expect(useSettingsStore.getState().language).toBe('en');
    expect(db.row.language).toBe('en');

    // Opened /hu, then signed out; the next account loads its own language.
    useSettingsStore.getState().chooseLinkedLanguage('hu');
    await vi.waitFor(() => expect(db.row.language).toBe('hu'));
    useSettingsStore.getState().resetLocalData();
    db.row = { ...db.row, language: 'es' };
    await useSettingsStore.getState().hydrateFromServer();
    expect(useSettingsStore.getState().language).toBe('es');
    expect(db.row.language).toBe('es');
  });

  it('keeps a past-due payer\'s Pro model choices through the payment grace', async () => {
    // The webhook leaves the tier alone on a failed renewal; the AI functions still serve Pro.
    const proChoices = Object.fromEntries(features.map((feature) => [
      feature,
      { provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5', reasoningEffort: 'medium' },
    ]));
    db.row = { ...db.row, subscription_tier: 'pro', feature_configs: proChoices };
    db.subscriptions = [{
      status: 'past_due',
      current_period_start: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      current_period_end: new Date(Date.now() + 28 * 86_400_000).toISOString(),
    }];

    await useSettingsStore.getState().hydrateFromServer();
    expect((db.row.feature_configs as Record<string, Row>).ask.model).toBe('anthropic/claude-sonnet-5.5');

    // Without the subscription the same account is not Pro, and the choice is reset.
    db.subscriptions = [];
    await useSettingsStore.getState().hydrateFromServer();
    expect((db.row.feature_configs as Record<string, Row>).ask.model).not.toBe('anthropic/claude-sonnet-5.5');
  });
});
