import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { shouldPrefillMotion } from '@/lib/debate/motion';
import { useCurrentDebate, useDebateStore, type DebateSide } from '@/lib/stores/debate-store';
import { isPendingSource, useSessionStore } from '@/lib/stores/session-store';
import { useSparringStore } from '@/lib/stores/sparring-store';

// eslint-disable-next-line react-refresh/only-export-components
export function sideLabelKey(side: DebateSide): string {
  return `debate.side.${side}`;
}

/**
 * Sources and saved outputs that belong to one debate. `activeSources` counts
 * the sources switched on, the ones a request can use, so every page that
 * names a count agrees with what Ask, Generate and the others say they use.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useDebateCounts(debateId: string | null | undefined) {
  // A row still saving is not counted until it is a source the tools can send.
  const sources = useSessionStore((state) => debateId ? state.sourceLibrary.filter((source) => source.debateId === debateId && !isPendingSource(source)).length : 0);
  const activeSources = useSessionStore((state) => debateId ? state.sourceLibrary.filter((source) => source.debateId === debateId && source.isActive && !isPendingSource(source)).length : 0);
  const outputs = useSessionStore((state) => debateId ? [
    state.savedCases, state.savedAttacks, state.savedBrainstorms, state.savedFactoids,
    state.savedChats, state.savedFlowcharts, state.savedCrossfires,
  ].reduce((count, list) => count + list.filter((item) => item.debateId === debateId).length, 0) : 0);
  const sparring = useSparringStore((state) => debateId ? state.savedSessions.filter((session) => session.debateId === debateId).length : 0);
  return { sources, activeSources, outputs: outputs + sparring };
}

/**
 * Fills a feature's motion from the Current Debate on open and after a switch,
 * without overwriting text the user typed themselves.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useDebateMotionPrefill(getMotion: () => string | undefined, setMotion: (motion: string) => void, disabled = false) {
  const debate = useCurrentDebate();
  const oneOff = useDebateStore((state) => state.oneOff);
  const getRef = useRef(getMotion);
  const setRef = useRef(setMotion);
  getRef.current = getMotion;
  setRef.current = setMotion;

  useEffect(() => {
    if (disabled || oneOff || !debate) return;
    const known = useDebateStore.getState().debates.map((item) => item.motion);
    if (shouldPrefillMotion(getRef.current(), debate.motion, known)) setRef.current(debate.motion);
  }, [debate, disabled, oneOff]);
}

/** Compact “Working in” line directly below each feature title. */
export function CurrentDebateStrip({ side, hidden = false, className = 'mb-6' }: { side?: DebateSide; hidden?: boolean; className?: string }) {
  const { t } = useTranslation();
  const debate = useCurrentDebate();
  const oneOff = useDebateStore((state) => state.oneOff);
  const setOneOff = useDebateStore((state) => state.setOneOff);
  const openDialog = useDebateStore((state) => state.openDialog);
  if (hidden) return null;

  const base = `${className} flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm`;

  if (oneOff) {
    return (
      <div className={`${base} border-dashed border-border bg-muted/40`} data-testid="current-debate-strip">
        <span className="min-w-0 flex-1 basis-48 text-muted-foreground">{t('debate.oneOffStrip', 'One-off mode: nothing here uses or saves to a debate.')}</span>
        {debate && <Button size="sm" variant="outline" onClick={() => setOneOff(false)}>{t('debate.returnToDebate', 'Return to debate')}</Button>}
      </div>
    );
  }

  if (!debate) {
    return (
      <div className={`${base} border-border bg-card/60`} data-testid="current-debate-strip">
        <span className="min-w-0 flex-1 basis-48 text-muted-foreground">{t('debate.noCurrentStrip', 'No current debate. Results stay one-off until you start one.')}</span>
        <Button size="sm" onClick={() => openDialog('create')}>{t('debate.startDebate', 'Start debate')}</Button>
      </div>
    );
  }

  return (
    <div className={`${base} border-primary/20 bg-primary/5`} data-testid="current-debate-strip">
      <span className="min-w-0 flex-1 basis-48">
        <span className="text-muted-foreground">{t('debate.workingIn', 'Working in:')} </span>
        <span className="wrap-break-word font-medium text-foreground">{debate.motion}</span>
      </span>
      {side && <Badge variant="outline">{t(sideLabelKey(side))}</Badge>}
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => openDialog('switch')}>{t('debate.change', 'Change')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOneOff(true)}>{t('debate.useOnceShort', 'Use once')}</Button>
      </div>
    </div>
  );
}
