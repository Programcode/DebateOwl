/**
 * The one-time DebateOwl welcome: the owl says hello, says what changed (the look only) and that
 * DebateLab is slowly becoming DebateOwl. It opens once per browser, inside the signed-in app.
 */
export const INTRO_SEEN_KEY = 'debateowl_intro_seen_v1';

/**
 * The owl's personal name, the same in every language. Empty until one is picked from the
 * shortlist; while empty the owl introduces itself as DebateOwl.
 */
export const OWL_NAME = '';

/** `?intro=show` opens the welcome even when seen or under test; `?intro=skip` keeps it closed. */
export const INTRO_QUERY_PARAM = 'intro';

type IntroStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface IntroEnvironment {
  VITE_E2E?: string;
  VITE_LOCAL_PREVIEW?: string;
}

/**
 * Whether this page load opens the welcome. Playwright (VITE_E2E) and the local verify stack
 * (VITE_LOCAL_PREVIEW) never see it unless the URL asks. Any stored value counts as seen, and
 * storage that can't be read keeps it closed, since a flag that can't be saved would reopen it
 * on every load.
 */
export function shouldShowIntro({ search, storage, env }: {
  search: string;
  storage: IntroStorage | undefined;
  env: IntroEnvironment;
}): boolean {
  const requested = new URLSearchParams(search).get(INTRO_QUERY_PARAM);
  if (requested === 'show') return true;
  if (requested === 'skip') return false;
  if (env.VITE_E2E === '1' || env.VITE_LOCAL_PREVIEW === 'true') return false;
  try {
    return storage !== undefined && storage.getItem(INTRO_SEEN_KEY) === null;
  } catch {
    return false;
  }
}

export function markIntroSeen(storage: IntroStorage | undefined, now = new Date()): void {
  try {
    storage?.setItem(INTRO_SEEN_KEY, now.toISOString());
  } catch {
    // Private mode or a full quota: the welcome closes for this load either way.
  }
}

export function browserStorage(): IntroStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
