import { describe, expect, it } from 'vitest';

import { createSerialQueue } from './serial-queue';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createSerialQueue', () => {
  it('finishes a slow task before starting the next', async () => {
    const queue = createSerialQueue();
    const writes: string[] = [];
    await Promise.all([
      queue(async () => {
        await delay(20);
        writes.push('hu');
      }),
      queue(async () => {
        writes.push('es');
      }),
    ]);
    expect(writes).toEqual(['hu', 'es']);
  });

  it('runs the next task after one fails', async () => {
    const queue = createSerialQueue();
    const failed = queue(async () => {
      await delay(5);
      throw new Error('offline');
    });
    const next = queue(async () => 'saved');
    await expect(failed).rejects.toThrow('offline');
    await expect(next).resolves.toBe('saved');
  });
});
