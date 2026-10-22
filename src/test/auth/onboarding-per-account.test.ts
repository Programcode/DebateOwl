import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'debate-trainer-onboarding';

async function loadStore() {
  vi.resetModules();
  return await import('@/hooks/use-onboarding');
}

describe('onboarding tour per account', () => {
  beforeEach(() => localStorage.clear());

  it('shows the tour to every new account on a browser, once each', async () => {
    const { useOnboardingStore, hasCompletedOnboarding } = await loadStore();
    useOnboardingStore.getState().setOnboardingComplete('student-a');

    const state = useOnboardingStore.getState();
    expect(hasCompletedOnboarding(state, 'student-a')).toBe(true);
    expect(hasCompletedOnboarding(state, 'student-b')).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      state: { completedUserIds: ['student-a'], legacyCompleted: false },
      version: 1,
    });
  });

  it('gives the old browser-wide "done" flag to the next account only', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 }));
    const { useOnboardingStore, hasCompletedOnboarding } = await loadStore();

    useOnboardingStore.getState().claimLegacyCompletion('student-a');
    useOnboardingStore.getState().claimLegacyCompletion('student-b');

    const state = useOnboardingStore.getState();
    expect(hasCompletedOnboarding(state, 'student-a')).toBe(true);
    expect(hasCompletedOnboarding(state, 'student-b')).toBe(false);
  });

  it('keeps the tour for a browser whose old flag says it was never finished', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { hasCompletedOnboarding: false, isTourRunning: false }, version: 0 }));
    const { useOnboardingStore, hasCompletedOnboarding } = await loadStore();

    useOnboardingStore.getState().claimLegacyCompletion('student-a');
    expect(hasCompletedOnboarding(useOnboardingStore.getState(), 'student-a')).toBe(false);
  });
});
