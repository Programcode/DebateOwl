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

  it('reads the saved row again when the save finishes during the fallback read', async () => {
    const writes = createSerialQueue();
    let releaseSave = () => {};
    void writes(() => new Promise<void>((resolve) => {
      releaseSave = resolve;
    }));
    const updated: FeatureConfig = { ...saved, model: 'deepseek/deepseek-v4-flash-0731' };
    const reads: ((settings: { config: FeatureConfig; pro: boolean }) => void)[] = [];
    let pendingChoice: { model: string } | null = { model: updated.model };
    const config = readFeatureConfigAfterWrites({
      writes,
      read: () => new Promise((resolve) => {
        reads.push(resolve);
      }),
      pending: () => pendingChoice,
      waitMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toHaveLength(1);
    releaseSave();
    pendingChoice = null;
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveLength(2);
    // The fallback copied the row before the save landed, then the choice was cleared.
    reads[0]?.({ config: saved, pro: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveLength(3);
    reads[2]?.({ config: updated, pro: true });
    await expect(config).resolves.toEqual(updated);
  });
});
