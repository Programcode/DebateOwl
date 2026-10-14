import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import type { FeatureConfig } from './feature-config';
import { readFeatureConfigAfterWrites } from './feature-config-read';
import { createSerialQueue } from './serial-queue';

const saved: FeatureConfig = { model: 'google/gemini-3.8-flash', temperature: 0.7, reasoningEffort: 'low' };

describe('readFeatureConfigAfterWrites', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs with the model still being saved when the save outlasts the wait', async () => {
    const writes = createSerialQueue();
    // The save of the new model hangs, so the row still holds the old one.
    void writes(() => new Promise<void>(() => {}));
    const config = readFeatureConfigAfterWrites({
      writes,
      read: async () => ({ config: saved, pro: false }),
      pending: () => ({ model: 'deepseek/deepseek-v4-flash-0731', reasoningEffort: 'medium' }),
      waitMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(config).resolves.toEqual({ ...saved, model: 'deepseek/deepseek-v4-flash-0731', reasoningEffort: 'medium' });
  });

  it('keeps the saved model when the pending one needs Pro access the student lacks', async () => {
    const writes = createSerialQueue();
    void writes(() => new Promise<void>(() => {}));
    const config = readFeatureConfigAfterWrites({
      writes,
      read: async () => ({ config: saved, pro: false }),
      pending: () => ({ model: 'auto-pro' }),
      waitMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(config).resolves.toEqual(saved);
  });
});
