import type { Href } from 'expo-router';

/**
 * Where tapping a notification goes. Pushes carry ids only, never debate
 * content (supabase/functions/_shared/push.ts), and the timer's time-up alert
 * (timer-alerts.ts) carries its kind; anything else opens the app as it was.
 */
export function notificationHref(data: unknown): Href | null {
  if (typeof data !== 'object' || data === null) return null;
  const { kind, sessionId } = data as Record<string, unknown>;
  if (kind === 'timer') return '/timer';
  if (kind === 'sparring_scored' && typeof sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(sessionId)) {
    return { pathname: '/sparring/[id]', params: { id: sessionId } };
  }
  return null;
}
