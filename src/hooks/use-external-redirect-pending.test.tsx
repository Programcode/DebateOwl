import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExternalRedirectPending } from './use-external-redirect-pending';
import { restoreFromBackForwardCache, restoreVisibility, setVisibility } from '@/test/helpers/page-lifecycle';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

afterEach(() => {
  restoreVisibility();
  vi.useRealTimers();
});

describe('useExternalRedirectPending', () => {
  it('clears pending when the page comes back from the back/forward cache', async () => {
    const { result } = renderHook(() => useExternalRedirectPending());
    await act(() => result.current.run(async () => undefined));
    expect(result.current.pending).toBe(true);

    restoreFromBackForwardCache();
    expect(result.current.pending).toBe(false);
  });

  it('starts one navigation per click while pending', async () => {
    const navigate = vi.fn(async () => undefined);
    const { result } = renderHook(() => useExternalRedirectPending());
    await act(async () => {
      await Promise.all([result.current.run(navigate), result.current.run(navigate)]);
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('keeps pending through tab switches and the timeout until the request resolves', async () => {
    vi.useFakeTimers();
    const request = deferred();
    const { result } = renderHook(() => useExternalRedirectPending(1000));
    let running!: Promise<void>;
    act(() => { running = result.current.run(() => request.promise); });

    setVisibility('hidden');
    setVisibility('visible');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      request.resolve();
      await running;
    });
    setVisibility('hidden');
    setVisibility('visible');
    expect(result.current.pending).toBe(false);
  });

  it('gives up waiting after the safety timeout', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useExternalRedirectPending(1000));
    await act(() => result.current.run(async () => undefined));
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current.pending).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.pending).toBe(false);
  });

  it('clears pending and rethrows when the navigation fails', async () => {
    const { result } = renderHook(() => useExternalRedirectPending());
    await act(async () => {
      await expect(result.current.run(async () => { throw new Error('no url'); })).rejects.toThrow('no url');
    });
    expect(result.current.pending).toBe(false);
  });

  it('keeps blocking a second request when reset while the first is still running', async () => {
    const request = deferred();
    const navigate = vi.fn(() => request.promise);
    const { result } = renderHook(() => useExternalRedirectPending());
    let running!: Promise<void>;
    act(() => { running = result.current.run(navigate); });

    act(() => result.current.reset());
    expect(result.current.pending).toBe(true);
    await act(() => result.current.run(navigate));
    expect(navigate).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve();
      await running;
    });
    act(() => result.current.reset());
    expect(result.current.pending).toBe(false);
  });
});
