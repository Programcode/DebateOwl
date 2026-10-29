import { useEffect, useSyncExternalStore } from 'react';

import { onAIRequestSettled } from './ai-request';
import { useAuth } from './auth';
import { fetchSubscription } from './subscription';

/**
 * Today's AI uses left, as the website's DailyUsage reads them: the server's
 * own weighted counter against the plan's limit. Read when a tool opens and
 * again after every AI request, so every tool's line agrees with You.
 */

export interface DailyUsage {
  remaining: number;
  limit: number;
}

let state: { userId: string; usage: DailyUsage | null } | null = null;
let readFor: string | null = null;
let reads = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Reads the count for this account; a later read, or another account's, wins. */
function refresh(userId: string) {
  const read = ++reads;
  readFor = userId;
  fetchSubscription(userId)
    .then((plan) => {
      if (read !== reads) return;
      const usage = plan.dailyUsed !== null && plan.dailyLimit > 0 ? { remaining: Math.max(0, plan.dailyLimit - plan.dailyUsed), limit: plan.dailyLimit } : null;
      state = { userId, usage };
      emit();
    })
    .catch((cause: unknown) => console.warn('Could not read today\'s AI uses:', cause instanceof Error ? cause.message : cause));
}

// Only while a line is on screen; a request then changes the count.
onAIRequestSettled(() => {
  if (listeners.size > 0 && readFor) refresh(readFor);
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in account's uses left today, or null while unknown or when the plan has none. */
export function useDailyUsage(): DailyUsage | null {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const current = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (userId) refresh(userId);
  }, [userId]);
  return userId && current?.userId === userId ? current.usage : null;
}

/** Next midnight UTC, shown on the student's local clock, as on the website. */
export function dailyResetTime(locale: string): string {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return reset.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}
