import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { getActiveEnv } from '@/lib/supabase/env';
import { reloadPage, switchEnv, type RemoteEnv } from '@/lib/supabase/switch-env';

type SwitchProps = { reload?: () => void };

/** Admin control in Settings. The caller decides who sees it. */
export function EnvironmentSwitcher({ reload = reloadPage }: SwitchProps) {
  const { t } = useTranslation();
  const { leaveEnvironment } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const active = getActiveEnv();
  if (active === 'local') return null;

  const target: RemoteEnv = active === 'staging' ? 'production' : 'staging';
  const label = target === 'staging' ? t('settings.switchToStaging') : t('settings.switchToProduction');

  return (
    <Card className="mt-8 mb-8">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{t('settings.developer')}</CardTitle>
          <Badge variant={active === 'staging' ? 'destructive' : 'secondary'}>{active}</Badge>
        </div>
        <CardDescription>{t('settings.developerDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>{label}</Button>
      </CardContent>
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!switching) setConfirmOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.envSwitchTitle')}</DialogTitle>
            <DialogDescription>{t('settings.envSwitchDesc', { target })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={switching} onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={switching}
              onClick={() => {
                setSwitching(true);
                void switchEnv(target, leaveEnvironment, reload);
              }}
            >
              {t('settings.envSwitchConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
