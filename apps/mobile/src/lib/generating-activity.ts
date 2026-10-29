import type { LivePhase } from '@debatelab/core/ai/live';
import type { LiveActivity, LiveActivityDismissalPolicy } from 'expo-widgets';
import { AppState } from 'react-native';

import {
  generatingActivityState,
  type GeneratingActivityState,
  type GeneratingProgress,
  type GeneratingTool,
} from './generating-activity-state';
import i18n from './i18n';
import { nativeCapabilities } from './native-capabilities';
import { widgetOwls } from './widget-images';

// The Live Activity for a case, attack, brainstorm or factoids run (Lock
// Screen and Dynamic Island). Like the timer's (live-activity.ts) it needs the
// development build with an App Group, so everywhere else, Expo Go included,
// every call here does nothing and the layout module is never loaded.
//
// iOS suspends the app a few seconds after it leaves the screen, and the
// answer's stream stops with it; the run itself goes on on the server, which
// keeps the answer in ai_run_results for the app to read back when it is
// opened again (ai-request.ts). So when the app leaves the screen during a run
// the activity is given a stale date shortly after: if the app is still
// suspended then, the layout says to open DebateOwl instead of a step that is
// no longer moving.

type LayoutModule = typeof import('@/widgets/generating-activity');

/** How long after leaving the screen the activity stops claiming progress. iOS gives a backgrounded app about this long. */
const STALE_AFTER_BACKGROUND_MS = 30_000;
/** How long a finished or failed run stays on the Lock Screen when the student is not in the app to see it. */
const KEEP_FINISHED_MS = 15 * 60_000;

const POSES = { research: 'reading', writing: 'point', checking: 'skeptical', done: 'celebrating', failed: 'surprised' } as const;

let layouts: LayoutModule | null | undefined;
let current: Run | null = null;
let watchingAppState = false;

function load(): LayoutModule | null {
  if (layouts !== undefined) return layouts;
  layouts = null;
  if (!nativeCapabilities().liveActivity) return null;
  try {
    // Loaded on first use: its top level registers the layout with the extension.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    layouts = require('@/widgets/generating-activity') as LayoutModule;
  } catch (cause) {
    console.warn('The generating Live Activity is unavailable:', cause instanceof Error ? cause.message : cause);
  }
  return layouts;
}

function warn(what: string, cause: unknown) {
  console.warn(`Could not ${what} the generating Live Activity:`, cause instanceof Error ? cause.message : cause);
}

export interface GeneratingActivityHandle {
  /** The step and how many parts are written. Unchanged values are not sent again. */
  update(progress: { phase?: LivePhase; parts: number }): void;
  /**
   * Ends the activity. A finished or failed run stays on the Lock Screen for a
   * while when the app is not on screen, so the student sees it is ready;
   * otherwise, and after a cancel, it goes at once.
   */
  finish(outcome: 'done' | 'failed' | 'cancelled'): void;
}

const NOOP: GeneratingActivityHandle = { update: () => {}, finish: () => {} };

class Run implements GeneratingActivityHandle {
  private activity: LiveActivity<GeneratingActivityState> | null = null;
  private progress: GeneratingProgress = { status: 'working', parts: 0 };
  private sent = '';
  private ended = false;
  private readonly startedAt = Date.now();
  private owls: GeneratingActivityState['owls'] | null = null;

  constructor(
    private readonly module: LayoutModule,
    private readonly tool: GeneratingTool,
    private readonly title: string,
  ) {
    void widgetOwls(Object.values(POSES)).then((uris) => {
      this.owls = {
        research: uris.reading,
        writing: uris.point,
        checking: uris.skeptical,
        done: uris.celebrating,
        failed: uris.surprised,
      };
      this.start();
    });
  }

  update(progress: { phase?: LivePhase; parts: number }) {
    if (this.ended) return;
    this.progress = { status: 'working', phase: progress.phase ?? this.progress.phase, parts: progress.parts };
    this.send();
  }

  finish(outcome: 'done' | 'failed' | 'cancelled') {
    if (this.ended) return;
    this.ended = true;
    if (current === this) current = null;
    const activity = this.activity;
    if (!activity) return;
    const away = AppState.currentState !== 'active';
    if (outcome === 'cancelled' || !away || !this.owls) {
      activity.end('immediate').catch((cause: unknown) => warn('end', cause));
      return;
    }
    this.progress = { ...this.progress, status: outcome };
    const policy: LiveActivityDismissalPolicy = { after: new Date(Date.now() + KEEP_FINISHED_MS) };
    activity.end(policy, this.state()).catch((cause: unknown) => warn('end', cause));
  }

  /** The app left the screen or came back: claim progress only while it can still be making it. */
  appStateChanged() {
    // Off screen when the owls arrived: iOS only starts an activity for an app on screen, so it starts now.
    if (!this.activity) {
      this.start();
      return;
    }
    this.sent = '';
    this.send();
  }

  private state(): GeneratingActivityState {
    return generatingActivityState(this.tool, this.title, this.startedAt, this.progress, this.owls!, i18n.t.bind(i18n));
  }

  private start() {
    if (this.ended || !this.owls || this.activity || AppState.currentState !== 'active') return;
    try {
      // No link: tapping the activity opens the app where the student left it, on the tool's screen.
      const state = this.state();
      this.activity = this.module.generatingActivity.start(state, undefined, this.staleDate());
      this.sent = JSON.stringify(state);
    } catch (cause) {
      // Live Activities may be off in Settings; the run goes on without one.
      warn('start', cause);
    }
  }

  private send() {
    if (this.ended || !this.activity || !this.owls) return;
    const state = this.state();
    const key = JSON.stringify(state);
    if (key === this.sent) return;
    this.sent = key;
    this.activity.update(state, this.staleDate()).catch((cause: unknown) => warn('update', cause));
  }

  private staleDate(): Date | undefined {
    return AppState.currentState === 'active' ? undefined : new Date(Date.now() + STALE_AFTER_BACKGROUND_MS);
  }
}

/**
 * Starts the Lock Screen activity for a live run, ending the one before it, so
 * only the newest run shows. Returns a handle that does nothing where Live
 * Activities are not available.
 */
export function beginGeneratingActivity(tool: GeneratingTool, title: string): GeneratingActivityHandle {
  const module = load();
  if (!module) return NOOP;
  current?.finish('cancelled');
  if (!watchingAppState) {
    watchingAppState = true;
    AppState.addEventListener('change', () => current?.appStateChanged());
  }
  current = new Run(module, tool, title);
  return current;
}

/**
 * Ends activities a previous launch left behind. A run does not survive the
 * app being closed, so nothing can bring them up to date. Called once from
 * the root layout.
 */
export function endLeftoverGeneratingActivities() {
  const module = load();
  if (!module) return;
  try {
    for (const instance of module.generatingActivity.getInstances()) {
      instance.end('immediate').catch((cause: unknown) => warn('end', cause));
    }
  } catch (cause) {
    warn('find', cause);
  }
}
