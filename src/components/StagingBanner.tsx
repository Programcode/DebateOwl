import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { getActiveEnv } from '@/lib/supabase/env';
import { reloadPage, switchEnv } from '@/lib/supabase/switch-env';

/**
 * Shown on every route while staging is active. A fresh staging session starts
 * signed out and Settings needs sign-in, so this is the way back that always works.
 */
export function StagingBanner({ reload = reloadPage }: { reload?: () => void }) {
  const { t } = useTranslation();
  const { leaveEnvironment } = useAuth();
  const [switching, setSwitching] = useState(false);
  if (getActiveEnv() !== 'staging') return null;

  return (
    <div
      role="status"
      className="relative z-[60] flex items-center justify-center gap-2 border-b border-amber-500/60 bg-amber-100 px-3 py-1 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    >
      <FlaskConical className="h-4 w-4" aria-hidden="true" />
      {t('settings.stagingBanner', 'Staging backend')}
      <Button
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
      </Button>
    </div>
  );
}
