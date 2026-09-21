import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/lib/stores/session-store';

export function AutoSavedSourcesUndo() {
  const { t } = useTranslation();
  const sourceLibrary = useSessionStore((state) => state.sourceLibrary);
  const removeSource = useSessionStore((state) => state.removeSource);
  const [removing, setRemoving] = useState(false);
  const autoSavedSources = sourceLibrary.filter((source) =>
    source.folder === 'Auto-saved' || Boolean(source.metadata?.capturedVia),
  );

  if (autoSavedSources.length === 0) return null;

  const handleUndo = async () => {
    setRemoving(true);
    try {
      const results = await Promise.allSettled(autoSavedSources.map((source) => removeSource(source.id)));
      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      if (failed === 0) {
        toast.success(t('autoSavedSources.removedTitle'), { description: t('autoSavedSources.removedDesc', { count: succeeded }) });
      } else if (succeeded === 0) {
        toast.error(t('autoSavedSources.removeFailed', 'Could not remove auto-saved sources.'), {
          description: t('autoSavedSources.removeFailedDesc', { succeeded, failed }),
        });
      } else {
        toast.warning(t('autoSavedSources.removedPartialTitle'), {
          description: t('autoSavedSources.removedPartialDesc', { succeeded, failed }),
        });
      }
    } catch {
      toast.error(t('autoSavedSources.removeFailed', 'Could not remove auto-saved sources.'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={() => void handleUndo()} title={t('autoSavedSources.undo')} disabled={removing}>
      <Undo2 className="h-4 w-4 mr-2" />
      {t('autoSavedSources.undo')}
    </Button>
  );
}
