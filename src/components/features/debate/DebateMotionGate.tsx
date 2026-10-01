import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { decideMotionTarget } from '@/lib/debate/motion';
import { useCurrentDebate, useDebateStore, type Debate } from '@/lib/stores/debate-store';

/** Where one submission's work belongs. `debateId: null` is one-off work. */
export interface DebateTarget {
  debateId: string | null;
}

interface PendingChoice {
  motion: string;
  matches: Debate[];
  resolve: (target: DebateTarget | null) => void;
}

/**
 * Before a motion-bearing tool submits, confirm which debate the work belongs
 * to. A motion other than the Current Debate's asks the user to switch to a
 * matching debate, create a new one, or use the motion once. With no Current
 * Debate there is nothing to switch away from, so the user is offered a debate
 * for the motion they typed instead.
 */
export function useDebateMotionGate(options: { disabled?: boolean } = {}): {
  /** Calls `proceed` right away when the target is clear, or after the user chooses. Cancelling never calls it. */
  run: (motion: string, proceed: (target: DebateTarget) => void) => void;
  dialog: ReactNode;
} {
  const { t } = useTranslation();
  const { toast } = useToast();
  const current = useCurrentDebate();
  const [pending, setPending] = useState<PendingChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<PendingChoice | null>(null);
  const disabled = Boolean(options.disabled);

  const run = useCallback((motion: string, proceed: (target: DebateTarget) => void) => {
    if (disabled) return proceed({ debateId: null });
    const decision = decideMotionTarget(motion, useDebateStore.getState());
    if (decision.kind === 'attach') return proceed({ debateId: decision.debateId });
    if (decision.kind === 'one-off') return proceed({ debateId: null });
    const choice = { motion, matches: decision.matches, resolve: (target: DebateTarget | null) => { if (target) proceed(target); } };
    pendingRef.current = choice;
    setPending(choice);
  }, [disabled]);

  const finish = (target: DebateTarget | null) => {
    pendingRef.current?.resolve(target);
    pendingRef.current = null;
    setPending(null);
  };

  const choose = async (action: () => Promise<DebateTarget>) => {
    setBusy(true);
    try {
      finish(await action());
    } catch {
      toast({ title: t('debate.saveFailed', 'Could not save the debate.'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) finish(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {current ? t('debate.mismatchTitle', 'This is a different motion') : t('debate.offerTitle', 'Start a debate with this motion?')}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p className="break-words border-l-2 border-primary pl-3 text-left font-medium text-foreground">{pending?.motion}</p>
              <p className="break-words">
                {current
                  ? t('debate.mismatchDesc', { motion: current.motion, defaultValue: 'Your Current Debate is “{{motion}}”.' })
                  : t('debate.offerDesc', 'A debate keeps this motion, its sources, and your results together, and every tool uses it.')}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {pending?.matches.map((debate) => (
            <Button
              key={debate.id}
              variant="outline"
              disabled={busy}
              className="h-auto justify-start whitespace-normal py-2 text-left"
              onClick={() => void choose(async () => {
                await useDebateStore.getState().switchDebate(debate.id);
                return { debateId: debate.id };
              })}
            >
              {t('debate.switchToExisting', 'Switch to this existing debate')}
            </Button>
          ))}
          <Button
            disabled={busy}
            onClick={() => void choose(async () => {
              const debate = await useDebateStore.getState().createDebate({ motion: pending?.motion ?? '' });
              return { debateId: debate.id };
            })}
          >
            {current ? t('debate.createFromMotion', 'Create a new debate for this motion') : t('debate.startDebate', 'Start debate')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => finish({ debateId: null })}>
            {current ? t('debate.useOnce', 'Use once without saving to a debate') : t('debate.offerNotNow', 'Not now, use it once')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { run, dialog };
}
