import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DebateOwlIntro } from '@/components/features/onboarding/DebateOwlIntro';
import { INTRO_SEEN_KEY, markIntroSeen, shouldShowIntro } from '@/lib/debateowl-intro';

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

describe('DebateOwlIntro', () => {
  function renderIntro(owlName?: string) {
    const storage = memoryStorage();
    render(<DebateOwlIntro onClose={() => markIntroSeen(storage)} owlName={owlName} />);
    return storage;
  }

  it('Got it marks it seen; Skip animation only skips ahead', () => {
    const storage = renderIntro();
    expect(screen.getByRole('dialog', { name: 'DebateLab is slowly becoming DebateOwl' })).toBeTruthy();
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

  it('fits the owl name in once one is picked', () => {
    renderIntro('OWL_NAME_PLACEHOLDER');
    expect(screen.getByText("Hi, I'm OWL_NAME_PLACEHOLDER from DebateOwl!")).toBeTruthy();
  });
});
