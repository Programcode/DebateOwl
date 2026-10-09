import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useToolRun } from '@/components/features/tools/tool-run';

describe('useToolRun', () => {
  it('cancels a run started by an earlier mount of the same tool', () => {
    // Start a run, leave the page, come back, press Cancel.
    const first = renderHook(() => useToolRun('generate'));
    const signal = first.result.current.start();
    first.unmount();
    const second = renderHook(() => useToolRun('generate'));
    second.result.current.cancel();
    expect(signal.aborted).toBe(true);
  });

  it('leaves other tools running', () => {
    const generate = renderHook(() => useToolRun('generate'));
    const signal = generate.result.current.start();
    renderHook(() => useToolRun('attack')).result.current.cancel();
    expect(signal.aborted).toBe(false);
  });
});
