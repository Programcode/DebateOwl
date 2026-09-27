import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { isDebateInactive, useCurrentDebate, useDebateStore, type Debate } from '@/lib/stores/debate-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { DebateForm, type DebateFormValues } from './DebateForm';

/** Switching or starting a debate from navigation clears open tool results so debates never mix. */
// eslint-disable-next-line react-refresh/only-export-components
export function useDebateNavigationActions() {
  const switchDebate = useDebateStore((state) => state.switchDebate);
  const createDebate = useDebateStore((state) => state.createDebate);
  const clearSession = useSessionStore((state) => state.clearSession);
  return {
    switchTo: async (id: string) => {
      await switchDebate(id);
      clearSession();
    },
    create: async (values: DebateFormValues) => {
      const debate = await createDebate(values);
      clearSession();
      return debate;
    },
  };
}

export function DebatePicker({ onPicked, excludeCurrent = false }: { onPicked: () => void; excludeCurrent?: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const debates = useDebateStore((state) => state.debates);
  const currentDebateId = useDebateStore((state) => state.currentDebateId);
  const deleteDebate = useDebateStore((state) => state.deleteDebate);
  const { switchTo } = useDebateNavigationActions();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const visible = excludeCurrent ? debates.filter((debate) => debate.id !== currentDebateId) : debates;

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('debate.noOtherDebates', 'You have no other debates yet.')}</p>;
  }

  const pick = async (debate: Debate) => {
    try {
      await switchTo(debate.id);
      onPicked();
    } catch {
      toast({ title: t('debate.switchFailed', 'Could not switch debates'), variant: 'destructive' });
    }
  };

  const remove = async (debate: Debate) => {
    try {
      await deleteDebate(debate.id);
      setConfirmingId(null);
      toast({ title: t('debate.deleted', 'Debate deleted') });
    } catch {
      toast({ title: t('debate.deleteFailed', 'Could not delete the debate'), variant: 'destructive' });
    }
  };

  return (
    <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1" aria-label={t('debate.yourDebates', 'Your debates')}>
      {visible.map((debate) => {
        const isCurrent = debate.id === currentDebateId;
        return (
          <li key={debate.id} className={cn('rounded-lg border p-3', isCurrent && 'border-primary/40 bg-primary/5')}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                onClick={() => void pick(debate)}
                aria-label={t('debate.switchToAria', { motion: debate.motion, defaultValue: 'Switch to {{motion}}' })}
              >
                <span className="block break-words font-medium">{debate.motion}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('debate.lastActivity', { when: formatRelativeDate(debate.lastActivityAt), defaultValue: 'Last activity {{when}}' })}
                </span>
              </button>
              {isCurrent ? (
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-label={t('debate.current', 'Current debate')} />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive"
                  onClick={() => setConfirmingId(debate.id)}
                  aria-label={t('debate.deleteAria', { motion: debate.motion, defaultValue: 'Delete {{motion}}' })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {confirmingId === debate.id && (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                <span className="mr-auto text-xs text-muted-foreground">{t('debate.deleteWarning', 'Deletes its sources and saved work.')}</span>
                <Button size="sm" variant="outline" onClick={() => setConfirmingId(null)}>{t('common.cancel', 'Cancel')}</Button>
                <Button size="sm" variant="destructive" onClick={() => void remove(debate)}>{t('common.delete', 'Delete')}</Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Global Switch and Start-new dialogs, opened from the header, strip, Home, or dashboard. */
export function DebateDialogs() {
  const { t } = useTranslation();
  const dialog = useDebateStore((state) => state.dialog);
  const dialogMotion = useDebateStore((state) => state.dialogMotion);
  const openDialog = useDebateStore((state) => state.openDialog);
  const { create } = useDebateNavigationActions();
  const close = () => openDialog(null);

  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-lg">
        {dialog === 'create' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('debate.startNew', 'Start new debate')}</DialogTitle>
              <DialogDescription>{t('debate.startNewDesc', 'Your tools, sources, and results will follow this motion. Older debates stay available.')}</DialogDescription>
            </DialogHeader>
            <DebateForm
              key={dialogMotion}
              idPrefix="new-debate"
              initial={{ motion: dialogMotion }}
              submitLabel={t('debate.startDebate', 'Start debate')}
              onCancel={close}
              onSubmit={async (values) => {
                await create(values);
                close();
              }}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('debate.switch', 'Switch debate')}</DialogTitle>
              <DialogDescription>{t('debate.switchDesc', 'Pick the motion you are preparing now.')}</DialogDescription>
            </DialogHeader>
            <DebatePicker onPicked={close} />
            <Button variant="outline" onClick={() => openDialog('create')}>{t('debate.startNew', 'Start new debate')}</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * After five days without meaningful work the app is blocked until the user
 * confirms the Current Debate, starts a new one, or switches.
 */
export function InactiveDebateGate() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const debate = useCurrentDebate();
  const hydrated = useDebateStore((state) => state.hydrated);
  const continueDebate = useDebateStore((state) => state.continueDebate);
  const { create } = useDebateNavigationActions();
  const [mode, setMode] = useState<'ask' | 'create' | 'switch'>('ask');

  const open = Boolean(hydrated && debate && isDebateInactive(debate));
  if (!open || !debate) return null;

  const handleContinue = async () => {
    try {
      await continueDebate();
    } catch {
      toast({ title: t('debate.continueFailed', 'Could not update the debate'), variant: 'destructive' });
    }
  };

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-lg" onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('debate.gateTitle', 'Still preparing this debate?')}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p className="break-words font-medium text-foreground">{debate.motion}</p>
              <p>{t('debate.gateDesc', { when: formatRelativeDate(debate.lastActivityAt), defaultValue: 'Last activity {{when}}. Choose how to continue.' })}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mode === 'ask' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setMode('switch')}>{t('debate.switch', 'Switch debate')}</Button>
            <Button variant="outline" onClick={() => setMode('create')}>{t('debate.startNew', 'Start new debate')}</Button>
            <Button onClick={() => void handleContinue()}>{t('debate.continue', 'Continue')}</Button>
          </div>
        )}
        {mode === 'create' && (
          <DebateForm
            idPrefix="gate-debate"
            submitLabel={t('debate.startDebate', 'Start debate')}
            onCancel={() => setMode('ask')}
            onSubmit={async (values) => {
              await create(values);
              setMode('ask');
            }}
          />
        )}
        {mode === 'switch' && (
          <div className="space-y-3">
            <DebatePicker excludeCurrent onPicked={() => setMode('ask')} />
            <Button variant="outline" className="w-full" onClick={() => setMode('ask')}>{t('common.back', 'Back')}</Button>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
