import type { LivePhase } from '@debatelab/core/ai/live';

/**
 * What the generating Live Activity shows (src/widgets/generating-activity.tsx).
 * The layout cannot reach i18n or the app's assets, so every word and each
 * owl's file comes in here, in the app's language.
 */

/** The four Prepare tools that write live. */
export type GeneratingTool = 'case' | 'attack' | 'brainstorm' | 'factoids';

export type GeneratingStatus = 'working' | 'done' | 'failed';

export interface GeneratingActivityState {
  /** The tool's name: "Generate", "Attack", "Brainstorm", "Factoids". */
  tool: string;
  /** The motion or case it works on, as the student wrote it. */
  title: string;
  status: GeneratingStatus;
  /** The step the run is on. Before the server names one it is research, the step every run starts with. */
  phase: LivePhase;
  /** The app's own line for that step ("Researching sources…", "Writing your case…"). */
  phaseLabel: string;
  /** "3 parts written", or null before the first part. */
  partsLabel: string | null;
  /** When the run started, in epoch ms: the layout counts the time since then. */
  startedAt: number;
  labels: { done: string; failed: string; waiting: string };
  /** Ollie's pose for each step and outcome, as file URIs in the App Group folder; null draws a symbol. */
  owls: Record<LivePhase | 'done' | 'failed', string | null>;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TOOL_NAMES: Record<GeneratingTool, string> = {
  case: 'nav.generate',
  attack: 'nav.attack',
  brainstorm: 'nav.brainstorm',
  factoids: 'nav.factoids',
};

// The tool's own line while it works, as the screen shows before the model names a step.
const WORKING: Record<GeneratingTool, string> = {
  case: 'generate.working',
  attack: 'attack.working',
  brainstorm: 'brainstorm.working',
  factoids: 'factoids.working',
};

const READY: Record<GeneratingTool, string> = {
  case: 'mobile.liveActivity.caseReady',
  attack: 'mobile.liveActivity.attackReady',
  brainstorm: 'mobile.liveActivity.brainstormReady',
  factoids: 'mobile.liveActivity.factoidsReady',
};

/** The same lines as the screen's live draft (components/live-run.tsx), so the Lock Screen never says something else. */
export function phaseLabel(tool: GeneratingTool, phase: LivePhase | undefined, t: Translate): string {
  if (phase === 'research') return t('tools.live.researching');
  if (phase === 'checking') return t('tools.live.checking');
  if (phase === 'writing') return t('tools.live.writing');
  return t(WORKING[tool]);
}

export interface GeneratingProgress {
  status: GeneratingStatus;
  phase?: LivePhase;
  /** Sections of the draft written so far. */
  parts: number;
}

/** The activity's state for one moment of a run. */
export function generatingActivityState(
  tool: GeneratingTool,
  title: string,
  startedAt: number,
  progress: GeneratingProgress,
  owls: GeneratingActivityState['owls'],
  t: Translate,
): GeneratingActivityState {
  return {
    tool: t(TOOL_NAMES[tool]),
    // The Lock Screen has one line for it; the layout truncates the rest.
    title: title.replace(/\s+/g, ' ').trim().slice(0, 160),
    status: progress.status,
    phase: progress.phase ?? 'research',
    phaseLabel: phaseLabel(tool, progress.phase, t),
    partsLabel: progress.parts > 0 ? t('mobile.liveActivity.parts', { count: progress.parts }) : null,
    startedAt,
    labels: {
      done: t(READY[tool]),
      failed: t('mobile.liveActivity.failed'),
      waiting: t('mobile.liveActivity.waiting'),
    },
    owls,
  };
}
