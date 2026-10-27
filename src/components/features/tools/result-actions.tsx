import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Clipboard, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/lib/stores/session-store';

// Results already in History, by object: a result saved once stays "Saved" when
// the student leaves the page and comes back. A reload starts the set over.
const savedResults = new WeakSet<object>();
const listeners = new Set<() => void>();

// eslint-disable-next-line react-refresh/only-export-components
export function markResultSaved(result: object | null | undefined): void {
  if (!result) return;
  savedResults.add(result);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useResultSaved(result: object | null | undefined): boolean {
  const marked = useSyncExternalStore(subscribe, () => Boolean(result && savedResults.has(result)));
  // A result reopened from History is the saved row's own data.
  const listed = useSessionStore((state) => Boolean(result) && [state.savedCases, state.savedBrainstorms, state.savedFactoids]
    .some((list) => (list as Array<{ data: unknown }>).some((item) => item.data === result)));
  return marked || listed;
}

/** Save to History, or a quiet "Saved" once the result is there. */
export function SaveResultAction({ saved, onSave, disabled = false }: { saved: boolean; onSave?: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  if (saved) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 px-2 text-sm text-muted-foreground" data-testid="result-saved">
        <Check className="h-4 w-4 text-primary" aria-hidden="true" />
        {t('resultActions.savedToHistory', 'Saved to history')}
      </span>
    );
  }
  if (!onSave) return null;
  return (
    <Button variant="outline" size="sm" onClick={onSave} disabled={disabled}>
      <Save className="mr-2 h-4 w-4" />
      {t('generateResults.save', 'Save')}
    </Button>
  );
}

/** Copies a plain-text version of a result. */
export function CopyResultButton({ getText }: { getText: () => string }) {
  const { t } = useTranslation();
  const copy = async () => {
    if (!navigator.clipboard?.writeText) {
      toast.error(t('generateResults.copyFailed', 'Unable to copy to clipboard'));
      return;
    }
    try {
      await navigator.clipboard.writeText(getText());
      toast.success(t('generateResults.copiedToClipboard', 'Copied to clipboard'));
    } catch {
      toast.error(t('generateResults.copyFailed', 'Unable to copy to clipboard'));
    }
  };
  return (
    <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => void copy()}>
      <Clipboard className="mr-2 h-4 w-4" />
      {t('generateResults.clipboard', 'Clipboard')}
    </Button>
  );
}
