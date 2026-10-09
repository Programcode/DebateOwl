import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/use-online-status';

export function OfflineIndicator() {
  const { t } = useTranslation();
  const offline = !useOnlineStatus();

  if (!offline) return null;

  return (
    <div className="native-safe-fixed-bottom fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur" role="status" aria-live="polite">
      <WifiOff className="h-4 w-4 text-amber-500" />
      {t('offlineIndicator.label', 'Offline mode')}
    </div>
  );
}
