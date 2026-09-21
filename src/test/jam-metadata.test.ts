import { describe, expect, it } from 'vitest';
import { setJamUserId } from '@/lib/jam-metadata';

interface JamWindow extends Window {
  __jam__?: { exports?: { metadata?: () => { userId: string | undefined } } };
}

function readMetadata() {
  return (window as JamWindow).__jam__?.exports?.metadata?.();
}

describe('jam metadata', () => {
  it('registers a metadata callback on the Jam global', () => {
    expect(typeof (window as JamWindow).__jam__?.exports?.metadata).toBe('function');
  });

  it('reports the current user id and clears it on sign-out', () => {
    setJamUserId('user-123');
    expect(readMetadata()).toEqual({ userId: 'user-123' });

    setJamUserId(undefined);
    expect(readMetadata()).toEqual({ userId: undefined });
  });
});
