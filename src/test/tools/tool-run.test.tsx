import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { abortToolRuns, useToolRun } from '@/components/features/tools/tool-run';

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

  it('stops every run and drops its draft when the account changes', () => {
    // Account A is mid-answer; account B signs in on the same tab and opens Generate.
    const a = renderHook(() => useToolRun('generate'));
    const signal = a.result.current.start();
    const live = a.result.current.live();
    act(() => live.onDraft({ caseStructure: { thesis: 'A private draft' } }));
    expect(a.result.current.liveState.draft).toBeDefined();

    act(() => abortToolRuns());
    expect(signal.aborted).toBe(true);
    const b = renderHook(() => useToolRun('generate'));
    expect(b.result.current.liveState).toEqual({});
    // A's request still answering cannot write into B's page.
    act(() => live.onDraft({ caseStructure: { thesis: 'more of A' } }));
    expect(b.result.current.liveState).toEqual({});
  });
});
