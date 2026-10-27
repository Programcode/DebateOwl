import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import { AppWelcome } from '@/App';
import { INTRO_SEEN_KEY } from '@/lib/debateowl-intro';
import { resetTourChunkLoadForTests } from '@/lib/onboarding-tour-load';
import { AuthContext, type AuthContextValue } from '@/lib/supabase/auth-context';
import { useDebateStore } from '@/lib/stores/debate-store';
import { useOnboardingStore } from '@/hooks/use-onboarding';

vi.mock('@/components/features/onboarding/OnboardingTour', () => ({
  get OnboardingTour() {
    throw new Error('chunk failed');
  },
}));

const signedIn: AuthContextValue = {
  session: null,
  user: { id: 'student-1' } as User,
  loading: false,
  callbackError: null,
  clearCallbackError: () => undefined,
  signInWithGoogle: async () => undefined,
  signInWithEmailOtp: async () => undefined,
  verifyEmailOtp: async () => undefined,
  signInWithDemoCode: async () => undefined,
  signOut: async () => undefined,
  leaveEnvironment: async () => undefined,
  discardTabState: () => undefined,
};

describe('AppWelcome when the tour chunk never loads', () => {
  beforeEach(() => {
    localStorage.clear();
    resetTourChunkLoadForTests();
    window.history.pushState({}, '', '/app?intro=show');
    useOnboardingStore.setState({ completedUserIds: [], legacyCompleted: false, isTourRunning: false });
    useDebateStore.setState({ currentDebateId: null, dialog: null });
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('gives up after the second failure, logs once, and leaves focus on the card', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <AuthContext.Provider value={signedIn}>
        <MemoryRouter initialEntries={['/app?intro=show']}>
          <div data-tour="current-debate"><button type="button">Open current debate</button></div>
          <AppWelcome />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const gotIt = await screen.findByRole('button', { name: 'Got it' }, { timeout: 5000 });
    const onboardingWarnings = () => warn.mock.calls.filter((call) => String(call[0]).includes('[Onboarding]'));
    expect(onboardingWarnings()).toHaveLength(0);

    fireEvent.click(gotIt);

    await waitFor(() => {
      expect(onboardingWarnings()).toHaveLength(1);
    });
    expect(screen.queryByRole('dialog', { name: 'DebateLab is slowly becoming DebateOwl' })).toBeNull();
    expect(screen.queryByText(/Start your first debate here/)).toBeNull();
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-tour="current-debate"] button'));
    });
    warn.mockRestore();
  });
});
