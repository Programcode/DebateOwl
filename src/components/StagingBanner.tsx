import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { getActiveEnv, isEnvPinned } from '@/lib/supabase/env';
import { reloadPage, switchEnv, useReloadOnEnvChange } from '@/lib/supabase/switch-env';

const BANNER_HEIGHT = '2.25rem'; // h-9

/**
 * Shown on every route while staging is active. A fresh staging session starts
 * signed out and Settings needs sign-in, so this is the way back that always works.
 * Mounted at the app root in every environment, it also keeps other tabs in step.
 */
export function StagingBanner({ reload = reloadPage }: { reload?: () => void }) {
  const { t } = useTranslation();
  const { leaveEnvironment, discardTabState } = useAuth();
  const [switching, setSwitching] = useState(false);
  useReloadOnEnvChange(discardTabState, reload);
  const staging = getActiveEnv() === 'staging';
  // Fixed and sticky headers offset themselves by this height so the strip
  // never covers them and they never cover it.
  useEffect(() => {
    if (!staging) return;
    document.documentElement.style.setProperty('--staging-banner-height', BANNER_HEIGHT);
    return () => {
      document.documentElement.style.removeProperty('--staging-banner-height');
    };
  }, [staging]);
  if (!staging) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex h-9 items-center justify-center gap-2 border-b border-amber-500/60 bg-amber-100 px-3 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    >
      <FlaskConical className="h-4 w-4" aria-hidden="true" />
      {t('settings.stagingBanner', 'Staging backend')}
      {!isEnvPinned() && <Button
        size="sm"
        variant="ghost"
        className="h-7 px-3 underline-offset-2 hover:underline"
        disabled={switching}
        onClick={() => {
          setSwitching(true);
          void switchEnv('production', leaveEnvironment, reload);
        }}
      >
        {t('settings.switchToProduction')}
      </Button>}
    </div>
  );
}
