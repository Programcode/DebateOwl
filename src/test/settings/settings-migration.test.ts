import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  row: {} as Row,
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
      from: () => ({
        select: () => ({ single: async () => ({ data: { ...db.row }, error: null as null }) }),
        update,
      }),
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
});
