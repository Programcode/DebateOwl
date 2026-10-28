import type { DebateCounts } from './debates';

/** The web preview has no Home Screen widget. Same signature as debate-widget.ts. */
export type CurrentDebateSnapshot = { debateId?: string; motion: string; counts: DebateCounts | null } | null;

export function publishCurrentDebate(_snapshot: CurrentDebateSnapshot): void {}
