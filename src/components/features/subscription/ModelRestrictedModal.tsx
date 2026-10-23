import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Zap } from 'lucide-react';
import { BILLING_ACTION_LABELS } from '@/lib/billing/plan';
import { PLAN_DIALOG_CLASS, PLAN_DIALOG_CLOSE_CLASS } from './dialog-layout';

interface ModelRestrictedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName?: string;
  onUpgrade: () => void;
}

export function ModelRestrictedModal({ open, onOpenChange, modelName, onUpgrade }: ModelRestrictedModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${PLAN_DIALOG_CLASS} sm:max-w-[420px]`} closeClassName={PLAN_DIALOG_CLOSE_CLASS}>
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{t('modelModal.title')}</DialogTitle>
          <DialogDescription className="text-center">
            {modelName
              ? t('modelModal.descriptionWithModel', { model: modelName })
              : t('modelModal.description')}
            {' '}{t('modelModal.upgradeNote')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-4">
          <Button onClick={onUpgrade} size="lg" className="w-full">
            <Zap className="h-4 w-4 mr-2" />
            {t(BILLING_ACTION_LABELS.upgrade)}
          </Button>
          <Button onClick={() => onOpenChange(false)} variant="ghost" className="w-full">
            {t('modelModal.useFree')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
