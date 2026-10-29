import type { LiveActivity } from 'expo-widgets';

import { nativeCapabilities } from './native-capabilities';
import { applyTimerActivityAction, type TimerActivityAction, type TimerActivityState } from './timer';
import { updateSession } from './timer-store';

import type { TimerWidgetProps } from '@/widgets/timer-widgets';

// The timer's Live Activity (Lock Screen and Dynamic Island) and its
// lock-screen widget. Both need the development build with an App Group
// (DEBATELAB_APP_GROUP), so everywhere else, Expo Go included, every call
// here does nothing and the widgets module is never loaded.

type WidgetsModule = typeof import('@/widgets/timer-widgets');
type ExpoWidgets = typeof import('expo-widgets');

/** The Live Activity's buttons (src/widgets/timer-widgets.tsx) by their fixed targets. */
const BUTTONS: Record<string, TimerActivityAction> = { 'timer-toggle': 'toggle', 'timer-next': 'next' };

let widgets: WidgetsModule | null | undefined;
let activity: LiveActivity<TimerActivityState> | null = null;
let adopted = false;
let lastKey = '';

function load(): WidgetsModule | null {
  if (widgets !== undefined) return widgets;
  widgets = null;
  if (!nativeCapabilities().liveActivity) return null;
  try {
    // Loaded on first use: its top level registers the layouts with the extension.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    widgets = require('@/widgets/timer-widgets') as WidgetsModule;
    listenForButtons();
  } catch (cause) {
    console.warn('Timer widgets are unavailable:', cause instanceof Error ? cause.message : cause);
  }
  return widgets;
}

/**
 * Pause, Resume and Next on the Lock Screen and in the Dynamic Island. iOS
 * runs the button's intent in the app's process, waking it in the background
 * if it has to; expo-widgets passes the press on here, and the round changes
 * as if the student had pressed the timer screen's own button. The change
 * reaches the activity through TimerRunner, like any other.
 */
function listenForButtons() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { addUserInteractionListener } = require('expo-widgets') as ExpoWidgets;
    addUserInteractionListener((event) => {
      const action = event.source === 'DebateTimerActivity' ? BUTTONS[event.target] : undefined;
      if (action) updateSession((current) => applyTimerActivityAction(current, action, Date.now()));
    });
  } catch (cause) {
    console.warn("Could not listen for the timer's Live Activity buttons:", cause instanceof Error ? cause.message : cause);
  }
}

function warn(what: string, cause: unknown) {
  console.warn(`Could not ${what} the timer's Live Activity:`, cause instanceof Error ? cause.message : cause);
}

/**
 * Shows `state` on the Lock Screen and in the Dynamic Island, or ends the
 * activity when it is null. An activity left by an earlier launch is taken
 * over, and any extra ones are ended, so one timer never shows twice.
 */
export function syncTimerActivity(state: TimerActivityState | null, idle: Omit<TimerWidgetProps, 'state'>, now = Date.now()) {
  const module = load();
  if (!module) return;
  const key = JSON.stringify([state, idle]);
  if (key === lastKey) return;
  lastKey = key;

  if (!adopted) {
    adopted = true;
    try {
      const [first, ...extra] = module.timerActivity.getInstances();
      activity = first ?? null;
      extra.forEach((instance) => instance.end('immediate').catch((cause: unknown) => warn('end', cause)));
    } catch (cause) {
      warn('find', cause);
    }
  }

  // The system de-emphasises the activity at the limit; the layout turns to overtime then.
  const staleDate = state && state.pausedAt === null && state.endsAt > now ? new Date(state.endsAt) : undefined;
  if (!state) {
    const ending = activity;
    activity = null;
    ending?.end('immediate').catch((cause: unknown) => warn('end', cause));
  } else if (activity) {
    activity.update(state, staleDate).catch((cause: unknown) => warn('update', cause));
  } else {
    try {
      activity = module.timerActivity.start(state, 'debatelab://timer', staleDate);
    } catch (cause) {
      // Live Activities switched off in Settings, or an iOS before 16.2.
      warn('start', cause);
    }
  }

  try {
    const props: TimerWidgetProps = { state, ...idle };
    // A speech that will run past its limit gets a second entry at the limit, when the widget turns to overtime.
    module.timerWidget.updateTimeline([
      { date: new Date(now), props },
      ...(staleDate && state?.kind === 'speech' ? [{ date: staleDate, props }] : []),
    ]);
  } catch (cause) {
    console.warn('Could not update the timer widget:', cause instanceof Error ? cause.message : cause);
  }
}
