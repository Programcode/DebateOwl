import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Code, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getActiveEnv, setActiveEnv, type SupabaseEnv } from '@/lib/supabase/env';
import { supabase } from '@/lib/supabase/client';

export function AdminDeveloperPanel() {
  const { t } = useTranslation();
  const currentEnv = getActiveEnv();
  const [confirmTarget, setConfirmTarget] = useState<SupabaseEnv | null>(null);

  const handleSwitch = async () => {
    if (!confirmTarget) return;
    await supabase.auth.signOut();
    setActiveEnv(confirmTarget);
    window.location.reload();
  };

  return (
    <>
      <Card className="mt-8 mb-8 border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-amber-500" />
            <CardTitle>{t('settings.developer')}</CardTitle>
            <Badge variant="outline" className={currentEnv === 'staging' ? 'border-amber-500 text-amber-500' : ''}>
              {currentEnv}
            </Badge>
          </div>
          <CardDescription>{t('settings.developerDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentEnv === 'production' ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmTarget('staging')}>
              {t('settings.switchToStaging')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmTarget('production')}>
              {t('settings.switchToProduction')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('settings.envSwitchTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.envSwitchDesc', { target: confirmTarget })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleSwitch()}>
              {t('settings.envSwitchConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
