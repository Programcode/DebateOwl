import { expect, it, vi } from 'vitest';

import { runRequest } from './run-request';

it('settles a request after its result or error handler, including an early return', async () => {
  const events: string[] = [];
  const cleanup = () => { events.push('settled'); };
  expect(await runRequest(async () => { events.push('work'); return 42; }, undefined, cleanup)).toBe(42);
  expect(events).toEqual(['work', 'settled']);
  events.length = 0;
  expect(await runRequest(async () => { throw new Error('refused'); }, async () => { events.push('failed'); return false; }, cleanup)).toBe(false);
  expect(events).toEqual(['failed', 'settled']);
  const rejected = vi.fn();
  await expect(runRequest(async () => { throw new Error('refused'); }, undefined, rejected)).rejects.toThrow('refused');
  expect(rejected).toHaveBeenCalledOnce();
});
