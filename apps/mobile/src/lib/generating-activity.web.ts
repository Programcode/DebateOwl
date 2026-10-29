import type { LivePhase } from '@debatelab/core/ai/live';

import type { GeneratingTool } from './generating-activity-state';

/**
 * The web preview has no Live Activities. It keeps the last run's steps on
 * `window`, so the screenshot script can check what the Lock Screen would
 * show. The phone app uses generating-activity.ts.
 */

type Recorded = { tool: GeneratingTool; title: string; phase?: LivePhase; parts: number; outcome: 'working' | 'done' | 'failed' | 'cancelled' };

export interface GeneratingActivityHandle {
  update(progress: { phase?: LivePhase; parts: number }): void;
  finish(outcome: 'done' | 'failed' | 'cancelled'): void;
}

function record(next: Recorded) {
  (window as unknown as { __debateowlGeneratingActivity?: Recorded }).__debateowlGeneratingActivity = next;
}

export function beginGeneratingActivity(tool: GeneratingTool, title: string): GeneratingActivityHandle {
  let state: Recorded = { tool, title, parts: 0, outcome: 'working' };
  record(state);
  return {
    update: (progress) => {
      if (state.outcome !== 'working') return;
      state = { ...state, phase: progress.phase ?? state.phase, parts: progress.parts };
      record(state);
    },
    finish: (outcome) => {
      if (state.outcome !== 'working') return;
      state = { ...state, outcome };
      record(state);
    },
  };
}

export function endLeftoverGeneratingActivities() {}
