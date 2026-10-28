import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Owl, type OwlPose } from '@/components/brand/Owl';
import { useTranslation } from 'react-i18next';
import { AlertCircle, X } from 'lucide-react';
import { Button, ThinkingDots } from '@/components/ui/button';
import type { LiveGeneration, LivePhase } from '@/lib/ai/client';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { aiFailureRecovery, type AIFailureRecovery } from '@/lib/ai/failure-reason';
import { SignInAgainButton } from '@/components/auth/SignInAgainButton';

export interface ToolRunError {
  title: string;
  description?: string;
  /** The next step. Retry shows unless the failure would repeat (`sign_in`, `none`). */
  recovery?: AIFailureRecovery;
}

/** A failed run's panel content: the page's title, the failure's plain reason, and its next step. */
// eslint-disable-next-line react-refresh/only-export-components
export function toolRunError(title: string, error: unknown, description: string = getUserFacingAIError(error)): ToolRunError {
  return { title, description, recovery: aiFailureRecovery(error) };
}

// The page can unmount mid-run (results still land in the store), so the request
// belongs to the tool, not to one mount of its page: Cancel works after coming back.
const controllers = new Map<string, AbortController>();

/** What the model has written so far in a tool's current run. */
export interface LiveRunState {
  phase?: LivePhase;
  draft?: Record<string, unknown>;
}

// The draft lives beside the request, so coming back to the page mid-run
// shows the answer as far as it has got.
const liveStates = new Map<string, LiveRunState>();
const liveListeners = new Set<() => void>();
const EMPTY_LIVE: LiveRunState = {};

function setLiveState(tool: string, state: LiveRunState | null): void {
  if (state) liveStates.set(tool, state);
  else liveStates.delete(tool);
  liveListeners.forEach((listener) => listener());
}

function subscribeLive(listener: () => void): () => void {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
}

/**
 * Cancels every tool's request and drops every live draft. Runs belong to the
 * signed-in account, so an account change must not leave one writing on screen.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function abortToolRuns(): void {
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
  liveStates.clear();
  liveListeners.forEach((listener) => listener());
}

/** One run of a form tool: a cancellable request, its live draft, and the error it ended with. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToolRun(tool: string) {
  const [error, setError] = useState<ToolRunError | null>(null);
  const liveState = useSyncExternalStore(subscribeLive, () => liveStates.get(tool) ?? EMPTY_LIVE);

  const start = useCallback(() => {
    controllers.get(tool)?.abort();
    const controller = new AbortController();
    controllers.set(tool, controller);
    setLiveState(tool, null);
    setError(null);
    return controller.signal;
  }, [tool]);

  /** Live updates for the run `start` just began; a later run silences them. */
  const live = useCallback((): LiveGeneration => {
    const controller = controllers.get(tool);
    const current = () => controller !== undefined && controllers.get(tool) === controller && !controller.signal.aborted;
    return {
      onDraft: (draft) => {
        if (current()) setLiveState(tool, { ...liveStates.get(tool), phase: 'writing', draft });
      },
      onPhase: (phase) => {
        if (current()) setLiveState(tool, { ...liveStates.get(tool), phase });
      },
    };
  }, [tool]);

  const cancel = useCallback(() => {
    controllers.get(tool)?.abort();
    controllers.delete(tool);
    setLiveState(tool, null);
  }, [tool]);

  return { start, live, liveState, cancel, error, setError, clearError: () => setError(null) };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useElapsedSeconds() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return elapsed;
}

/** The owl at work, one true status line, elapsed time once it matters, and a way out. */
export function ToolRunStatus({ label, onCancel, pose = 'idea' }: { label: string; onCancel?: () => void; pose?: OwlPose }) {
  const { t } = useTranslation();
  const elapsed = useElapsedSeconds();
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border-strong bg-card/60 p-8 text-center motion-safe:animate-in fade-in-0 duration-300">
      <span className="owl-bob">
        <Owl pose={pose} size={120} priority breathe={false} />
      </span>
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.9375rem] font-bold text-foreground">
        <span role="status" aria-live="polite">{label}</span>
        <ThinkingDots className="text-primary" />
        {elapsed >= 5 && <span className="tabular-nums text-muted-foreground">{t('tools.elapsed', { seconds: elapsed, defaultValue: '{{seconds}}s' })}</span>}
      </p>
      {onCancel && (
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
      )}
    </div>
  );
}

/** A failed run stays on the page with Retry, instead of a toast that disappears. */
export function ToolRunErrorPanel({ error, onRetry, onDismiss }: { error: ToolRunError; onRetry?: () => void; onDismiss?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border-2 border-destructive/30 bg-danger-tint p-4 text-sm motion-safe:animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-danger-text" aria-hidden="true">
        <AlertCircle className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-extrabold text-foreground">{error.title}</p>
        {error.description && <p className="mt-0.5 text-muted-foreground">{error.description}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {error.recovery === 'sign_in'
          ? <SignInAgainButton />
          : onRetry && error.recovery !== 'none' && <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t('common.retry', 'Retry')}</Button>}
        {onDismiss && (
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onDismiss} aria-label={t('common.close', 'Close')}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Whether an error is the user's own Cancel, which needs no message. */
// eslint-disable-next-line react-refresh/only-export-components
export function isCanceled(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
}

/**
 * On phones the results sit below the form, so a finished run scrolls them into view.
 * Wide screens show both side by side and stay put.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRevealResults() {
  const ref = useRef<HTMLDivElement>(null);
  const reveal = useCallback(() => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // After the result renders.
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
  }, []);
  return { ref, reveal };
}
