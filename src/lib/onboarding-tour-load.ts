import { browserStorage, markIntroSeen } from '@/lib/debateowl-intro';

/** The welcome preloads the tour once. The tour owner tries once more, then stops. */
const TOUR_CHUNK_ATTEMPTS = 2;

let attempts = 0;
let logged = false;

export function resetTourChunkLoadForTests(): void {
  attempts = 0;
  logged = false;
}

export function tourChunkGaveUp(): boolean {
  return attempts >= TOUR_CHUNK_ATTEMPTS;
}

/**
 * Count one failed fetch of the tour chunk. The second failure logs once,
 * remembers the welcome, and lets the page continue without the tour.
 */
export function noteTourChunkFailure(error: unknown): 'retry' | 'give-up' {
  attempts += 1;
  if (attempts < TOUR_CHUNK_ATTEMPTS) return 'retry';
  if (!logged) {
    logged = true;
    const detail = error instanceof Error ? error.message : 'unknown error';
    console.warn('[Onboarding] Could not load the tour. Continuing without it.', detail);
    markIntroSeen(browserStorage());
  }
  return 'give-up';
}

/** The Current Debate card is what the first step was pointing at. */
export function focusCurrentDebate(): void {
  if (typeof document === 'undefined') return;
  const card = document.querySelector<HTMLElement>('[data-tour="current-debate"]');
  if (!card) return;
  const control = card.querySelector<HTMLElement>('button:not([disabled]), a[href]');
  (control ?? card).focus();
}

/** Joyride's Next button, the action the welcome just handed the student. */
export function focusTourPrimary(): void {
  if (typeof document === 'undefined') return;
  document.querySelector<HTMLElement>('[data-action="primary"]')?.focus();
}
