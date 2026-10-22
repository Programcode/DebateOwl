import type { Debate } from './debates';

/**
 * The website's motion rules (src/lib/debate/motion.ts and normalizeMotion in
 * src/lib/stores/debate-store.ts): which debate a motion-bearing tool's work
 * belongs to, and when a form's motion follows the Current Debate.
 */

export function normalizeMotion(motion: string): string {
  return motion.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function sameMotion(a: string | undefined | null, b: string | undefined | null): boolean {
  return Boolean(a && b) && normalizeMotion(a!) === normalizeMotion(b!);
}

/** The website's suggestDebate (UnsortedWork.tsx): a debate only on an exact motion or title match; the student still confirms. */
export function suggestDebate(debates: Debate[], candidates: (string | undefined)[]): Debate | undefined {
  return debates.find((debate) => candidates.some((candidate) => sameMotion(debate.motion, candidate)));
}

export type MotionDecision =
  | { kind: 'attach'; debateId: string }
  | { kind: 'one-off' }
  /** A different (or first) motion: the student chooses Switch, Create, or Use once. */
  | { kind: 'ask'; matches: Debate[] };

/** Only an exact motion match attaches silently; anything else asks. */
export function decideMotionTarget(motion: string, state: { debates: Debate[]; current: Debate | null; oneOff: boolean }): MotionDecision {
  if (state.oneOff) return { kind: 'one-off' };
  const { current } = state;
  if (current && sameMotion(current.motion, motion)) return { kind: 'attach', debateId: current.id };
  return {
    kind: 'ask',
    matches: state.debates.filter((debate) => debate.id !== current?.id && sameMotion(debate.motion, motion)),
  };
}

/** Fill the motion from the Current Debate only when the field is empty or still holds another debate's motion. */
export function shouldPrefillMotion(formMotion: string | undefined, debateMotion: string, knownMotions: string[]): boolean {
  const current = normalizeMotion(formMotion ?? '');
  if (!current) return true;
  if (current === normalizeMotion(debateMotion)) return false;
  return knownMotions.some((motion) => normalizeMotion(motion) === current);
}
