import { sessionSlot } from './session-memory';

/** Only a debate created in this account's current session gets the welcome wave. */
const pending = sessionSlot<string | null>(() => null);

export function markNewDebate(id: string) {
  pending.set(id);
}

export function takeNewDebate(id: string): boolean {
  if (pending.get() !== id) return false;
  pending.set(null);
  return true;
}
