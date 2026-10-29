import type { TimerSession } from './timer';

/** The web preview has no local notifications; the phone app uses timer-alerts.ts. */
export async function askForTimerAlerts(): Promise<void> {}

export function useTimerAlerts(_session: TimerSession, _loaded: boolean) {}
