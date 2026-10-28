import type { TimerActivityState } from './timer';

/**
 * The web preview has no Live Activities. It keeps the last state on
 * `window`, so the screenshot script can check what the Lock Screen would
 * show. The phone app uses live-activity.ts.
 */
export function syncTimerActivity(state: TimerActivityState | null, idle: { idleTitle: string; idleLine: string }) {
  (window as unknown as { __debatelabTimerActivity?: unknown }).__debatelabTimerActivity = { state, ...idle };
}
