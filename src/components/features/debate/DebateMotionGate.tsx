import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { decideMotionTarget } from '@/lib/debate/motion';
import { selectCurrentDebate, useCurrentDebate, useDebateStore, type Debate } from '@/lib/stores/debate-store';

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
 * for the motion they typed instead, or with `startImplicitly` the debate is
 * created without asking and a toast says so.
 */
export function useDebateMotionGate(options: { disabled?: boolean; startImplicitly?: boolean } = {}): {
  /** Calls `proceed` right away when the target is clear, or after the user chooses. Cancelling never calls it. */
  run: (motion: string, proceed: (target: DebateTarget) => void) => void;
  dialog: ReactNode;
  /** True while a debate is being created without a dialog. */
  busy: boolean;
} {
  const { t } = useTranslation();
  const { toast } = useToast();
  const current = useCurrentDebate();
  const [pending, setPending] = useState<PendingChoice | null>(null);
  // Which choice is in flight; every choice waits for it, so one click is one create.
  const [busy, setBusy] = useState<'switch' | 'create' | null>(null);
  const pendingRef = useRef<PendingChoice | null>(null);
  const disabled = Boolean(options.disabled);
  const startImplicitly = Boolean(options.startImplicitly);
  // One submit is one create, even when the button is clicked again before it disables.
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);

  const run = useCallback((motion: string, proceed: (target: DebateTarget) => void) => {
    if (disabled) return proceed({ debateId: null });
    const decision = decideMotionTarget(motion, useDebateStore.getState());
    if (decision.kind === 'attach') return proceed({ debateId: decision.debateId });
    if (decision.kind === 'one-off') return proceed({ debateId: null });
    const choice = { motion, matches: decision.matches, resolve: (target: DebateTarget | null) => { if (target) proceed(target); } };
    const ask = () => {
      pendingRef.current = choice;
      setPending(choice);
    };
    // With no Current Debate and no debate for this motion, start one instead of asking.
    // Only once the list has loaded: an empty list before that may hide a Current Debate,
    // and creating one would move the server's pointer away from it without asking.
    const debates = useDebateStore.getState();
    if (!startImplicitly || !debates.hydrated || decision.matches.length > 0 || selectCurrentDebate(debates)) return ask();
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    useDebateStore.getState().createDebate({ motion })
      .then((debate) => {
        toast({
          title: t('debate.startedForMotion', 'Started a debate for this motion'),
          description: t('debate.startedForMotionDesc', 'Its sources and results stay together. Rename or switch it from Current debate.'),
        });
        proceed({ debateId: debate.id });
      })
      // Creating failed: fall back to asking, which can still use the motion once.
      .catch(ask)
      .finally(() => {
        startingRef.current = false;
        setStarting(false);
      });
  }, [disabled, startImplicitly, t, toast]);

  const finish = (target: DebateTarget | null) => {
    pendingRef.current?.resolve(target);
    pendingRef.current = null;
    setPending(null);
  };

  const choose = async (kind: 'switch' | 'create', action: () => Promise<DebateTarget>) => {
    if (busy) return;
    setBusy(kind);
    try {
      finish(await action());
    } catch {
      toast({ title: t('debate.saveFailed', 'Could not save the debate.'), variant: 'destructive' });
    } finally {
      setBusy(null);
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
              disabled={busy !== null}
              className="h-auto justify-start whitespace-normal py-2 text-left"
              onClick={() => void choose('switch', async () => {
                await useDebateStore.getState().switchDebate(debate.id);
                return { debateId: debate.id };
              })}
            >
              {t('debate.switchToExisting', 'Switch to this existing debate')}
            </Button>
          ))}
          <Button
            disabled={busy !== null}
            aria-busy={busy === 'create'}
            onClick={() => void choose('create', async () => {
              const debate = await useDebateStore.getState().createDebate({ motion: pending?.motion ?? '' });
              return { debateId: debate.id };
            })}
          >
            {busy === 'create' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy === 'create'
              ? t('debate.creating', 'Creating…')
              : current ? t('debate.createFromMotion', 'Create a new debate for this motion') : t('debate.startDebate', 'Start debate')}
          </Button>
          <Button variant="ghost" disabled={busy !== null} onClick={() => finish({ debateId: null })}>
            {current ? t('debate.useOnce', 'Use once without saving to a debate') : t('debate.offerNotNow', 'Not now, use it once')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { run, dialog, busy: starting };
}
