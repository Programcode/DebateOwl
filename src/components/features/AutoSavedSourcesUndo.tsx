import { Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/lib/stores/session-store';

export function AutoSavedSourcesUndo() {
  const { t } = useTranslation();
  const sourceLibrary = useSessionStore((state) => state.sourceLibrary);
  const removeSource = useSessionStore((state) => state.removeSource);
  const autoSavedSources = sourceLibrary.filter((source) => source.folder === 'Auto-saved');

  if (autoSavedSources.length === 0) return null;

  const handleUndo = async () => {
    const count = autoSavedSources.length;
    await Promise.all(autoSavedSources.map((source) => removeSource(source.id)));
    toast.success(t('autoSavedSources.removedTitle'), {
      description: t('autoSavedSources.removedDesc', { count }),
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={() => void handleUndo()} title={t('autoSavedSources.undo')}>
      <Undo2 className="h-4 w-4 mr-2" />
      {t('autoSavedSources.undo')}
    </Button>
  );
}
