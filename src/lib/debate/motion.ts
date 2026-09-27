import { normalizeMotion, sameMotion, type Debate } from '@/lib/stores/debate-store';

export type MotionDecision =
  | { kind: 'attach'; debateId: string }
  | { kind: 'one-off' }
  /** A different (or first) motion: the user chooses Switch, Create, or Use once. */
  | { kind: 'ask'; matches: Debate[] };

/**
 * Decides where a submission with this motion belongs before anything is sent.
 * Only an exact motion match attaches silently; anything else asks.
 */
export function decideMotionTarget(
  motion: string,
  state: { debates: Debate[]; currentDebateId: string | null; oneOff: boolean },
): MotionDecision {
  if (state.oneOff) return { kind: 'one-off' };
  const current = state.debates.find((debate) => debate.id === state.currentDebateId);
  if (current && sameMotion(current.motion, motion)) return { kind: 'attach', debateId: current.id };
  return {
    kind: 'ask',
    matches: state.debates.filter((debate) => debate.id !== current?.id && sameMotion(debate.motion, motion)),
  };
}

/**
 * Prefill a feature's motion from the Current Debate only when the field is
 * empty or still holds another debate's motion, never over the user's own text.
 */
export function shouldPrefillMotion(formMotion: string | undefined, debateMotion: string, knownMotions: string[]): boolean {
  const current = normalizeMotion(formMotion ?? '');
  if (!current) return true;
  if (current === normalizeMotion(debateMotion)) return false;
  return knownMotions.some((motion) => normalizeMotion(motion) === current);
}
