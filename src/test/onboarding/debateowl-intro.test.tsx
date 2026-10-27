import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import { AppWelcome } from '@/App';
import { DebateOwlIntro } from '@/components/features/onboarding/DebateOwlIntro';
import { FirstRun } from '@/components/features/onboarding/FirstRun';
import { OnboardingTour } from '@/components/features/onboarding/OnboardingTour';
import { useOnboardingStore } from '@/hooks/use-onboarding';
import { INTRO_SEEN_KEY, firstRunStep, markIntroSeen, shouldShowIntro } from '@/lib/debateowl-intro';
import { noteTourChunkFailure, resetTourChunkLoadForTests } from '@/lib/onboarding-tour-load';
import { AuthContext, type AuthContextValue } from '@/lib/supabase/auth-context';
import { useDebateStore } from '@/lib/stores/debate-store';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

const appEnv = {};

describe('shouldShowIntro', () => {
  it('shows once: never seen opens it, a stored flag of any value keeps it closed', () => {
    const storage = memoryStorage();
    expect(shouldShowIntro({ search: '', storage, env: appEnv })).toBe(true);
    markIntroSeen(storage);
    expect(shouldShowIntro({ search: '', storage, env: appEnv })).toBe(false);
    expect(shouldShowIntro({ search: '', storage: memoryStorage({ [INTRO_SEEN_KEY]: '1' }), env: appEnv })).toBe(false);
  });

  it('stays closed under Playwright and the local verify stack unless the URL asks for it', () => {
    const storage = memoryStorage();
    expect(shouldShowIntro({ search: '', storage, env: { VITE_E2E: '1' } })).toBe(false);
    expect(shouldShowIntro({ search: '', storage, env: { VITE_LOCAL_PREVIEW: 'true' } })).toBe(false);
    expect(shouldShowIntro({ search: '?intro=show', storage, env: { VITE_E2E: '1' } })).toBe(true);
  });

  it('follows ?intro=show and ?intro=skip over the stored flag', () => {
    expect(shouldShowIntro({ search: '?intro=skip', storage: memoryStorage(), env: appEnv })).toBe(false);
    expect(shouldShowIntro({ search: '?intro=show', storage: memoryStorage({ [INTRO_SEEN_KEY]: 'x' }), env: appEnv })).toBe(true);
  });

  it('stays closed when storage cannot be read, since the flag could not be saved either', () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(shouldShowIntro({ search: '', storage: blocked, env: appEnv })).toBe(false);
    expect(shouldShowIntro({ search: '', storage: undefined, env: appEnv })).toBe(false);
    expect(() => markIntroSeen(blocked)).not.toThrow();
  });
});

describe('firstRunStep', () => {
  it('opens the welcome first, then continues into the Start debate step', () => {
    expect(firstRunStep({ showIntro: true, introDismissed: false, tourCompleted: false })).toBe('intro');
    expect(firstRunStep({ showIntro: true, introDismissed: true, tourCompleted: false })).toBe('start-debate');
  });

  it('lets an unfinished tour open on its own when the welcome is not due', () => {
    expect(firstRunStep({ showIntro: false, introDismissed: false, tourCompleted: false })).toBe('tour');
    expect(firstRunStep({ showIntro: false, introDismissed: true, tourCompleted: false })).toBe('tour');
  });

  it('keeps a finished tour closed, including when the welcome is replayed', () => {
    expect(firstRunStep({ showIntro: true, introDismissed: false, tourCompleted: true })).toBe('intro');
    expect(firstRunStep({ showIntro: true, introDismissed: true, tourCompleted: true })).toBe('idle');
    expect(firstRunStep({ showIntro: false, introDismissed: false, tourCompleted: true })).toBe('idle');
  });
});

describe('FirstRun', () => {
  it('Got it marks the welcome seen and continues into the Start debate step', () => {
    const storage = memoryStorage();
    const tour = vi.fn((continueFromIntro: boolean) => <p>{continueFromIntro ? 'start-debate' : 'tour'}</p>);
    render(
      <FirstRun
        showIntro
        tourCompleted={false}
        onIntroSeen={() => markIntroSeen(storage)}
        tour={tour}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'DebateLab is becoming DebateOwl' })).toBeTruthy();
    expect(screen.queryByText('start-debate')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Skip animation' }));
    expect(storage.getItem(INTRO_SEEN_KEY)).toBeNull();
    expect(screen.queryByText('start-debate')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(shouldShowIntro({ search: '', storage, env: appEnv })).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('start-debate')).toBeTruthy();
  });

  it('Esc closes the welcome the same way and still continues', () => {
    const tour = vi.fn((continueFromIntro: boolean) => <p>{continueFromIntro ? 'start-debate' : 'tour'}</p>);
    render(<FirstRun showIntro tourCompleted={false} onIntroSeen={() => undefined} tour={tour} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByText('start-debate')).toBeTruthy();
  });

  it('?intro=show replays the welcome and does not restart a finished tour', () => {
    const storage = memoryStorage({ [INTRO_SEEN_KEY]: 'seen' });
    const showIntro = shouldShowIntro({ search: '?intro=show', storage, env: appEnv });
    const tour = vi.fn((continueFromIntro: boolean) => <p>{continueFromIntro ? 'restarted' : 'owner'}</p>);
    render(<FirstRun showIntro={showIntro} tourCompleted onIntroSeen={() => markIntroSeen(storage)} tour={tour} />);

    expect(screen.getByRole('dialog', { name: 'DebateLab is becoming DebateOwl' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText('restarted')).toBeNull();
    expect(screen.getByText('owner')).toBeTruthy();
    expect(shouldShowIntro({ search: '', storage, env: appEnv })).toBe(false);
  });

  it('with no welcome, the tour opens on its own and not as a continuation', () => {
    const tour = vi.fn((continueFromIntro: boolean) => <p>{continueFromIntro ? 'start-debate' : 'tour'}</p>);
    render(<FirstRun showIntro={false} tourCompleted={false} onIntroSeen={() => undefined} tour={tour} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('tour')).toBeTruthy();
  });
});

describe('OnboardingTour continuing from the welcome', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboardingStore.setState({ completedUserIds: [], legacyCompleted: false, isTourRunning: false });
    useDebateStore.setState({ currentDebateId: null, dialog: null });
  });

  function renderTour(continueFromIntro: boolean) {
    return render(
      <MemoryRouter initialEntries={['/app']}>
        <div data-tour="current-debate"><button type="button">Open current debate</button></div>
        <OnboardingTour userId="student-1" continueFromIntro={continueFromIntro} eligibleAt={0} />
      </MemoryRouter>,
    );
  }

  it('opens the Start debate step and not a second welcome dialog', async () => {
    renderTour(true);
    expect(screen.getByText(/Start your first debate here/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start debate' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'DebateLab is becoming DebateOwl' })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-action="primary"]'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-tour="current-debate"] button'));
    });
  });

  it('stays closed when that account has already finished the tour', () => {
    useOnboardingStore.getState().setOnboardingComplete('student-1');
    renderTour(true);
    expect(screen.queryByText(/Start your first debate here/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start debate' })).toBeNull();
  });
});

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

describe('AppWelcome hands the welcome to the Start debate step', () => {
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

  it('Got it closes the welcome into the tour, with focus on the tour and then the card', async () => {
    render(
      <AuthContext.Provider value={signedIn}>
        <MemoryRouter initialEntries={['/app?intro=show']}>
          <div data-tour="current-debate"><button type="button">Open current debate</button></div>
          <AppWelcome />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const gotIt = await screen.findByRole('button', { name: 'Got it' }, { timeout: 5000 });
    expect(gotIt).toHaveFocus();
    fireEvent.click(gotIt);

    expect(await screen.findByText(/Start your first debate here/)).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'DebateLab is becoming DebateOwl' })).toBeNull();
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-action="primary"]'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-tour="current-debate"] button'));
    });
  });
});

describe('a tour chunk that fails to load', () => {
  beforeEach(() => {
    localStorage.clear();
    resetTourChunkLoadForTests();
  });

  it('retries once, then logs once and remembers the welcome', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(noteTourChunkFailure(new Error('offline'))).toBe('retry');
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBeNull();
    expect(warn).not.toHaveBeenCalled();

    expect(noteTourChunkFailure(new Error('offline'))).toBe('give-up');
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBeTruthy();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('[Onboarding] Could not load the tour');

    expect(noteTourChunkFailure(new Error('offline'))).toBe('give-up');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('DebateOwlIntro', () => {
  function renderIntro(owlName?: string) {
    const storage = memoryStorage();
    render(<DebateOwlIntro onClose={() => markIntroSeen(storage)} owlName={owlName} />);
    return storage;
  }

  it('Got it marks it seen; Skip animation only skips ahead', () => {
    const storage = renderIntro();
    expect(screen.getByRole('dialog', { name: 'DebateLab is becoming DebateOwl' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip animation' }));
    expect(screen.queryByRole('button', { name: 'Skip animation' })).toBeNull();
    expect(shouldShowIntro({ search: '', storage, env: appEnv })).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(shouldShowIntro({ search: '', storage, env: appEnv })).toBe(false);
  });

  it('Esc marks it seen', () => {
    const storage = renderIntro();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(shouldShowIntro({ search: '', storage, env: appEnv })).toBe(false);
  });

  it('introduces the owl as DebateOwl until it has a name', () => {
    renderIntro('');
    expect(screen.getByText("Hi, I'm DebateOwl!")).toBeTruthy();
  });

  it('Ollie introduces itself by name', () => {
    renderIntro();
    expect(screen.getByText("Hi, I'm Ollie!")).toBeTruthy();
  });
});
