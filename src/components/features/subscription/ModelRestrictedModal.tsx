import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Zap } from 'lucide-react';

interface ModelRestrictedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName?: string;
  onUpgrade: () => void;
}

export function ModelRestrictedModal({ open, onOpenChange, modelName, onUpgrade }: ModelRestrictedModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Pro Model</DialogTitle>
          <DialogDescription className="text-center">
            {modelName
              ? `${modelName} is reserved for Pro members.`
              : 'This model is reserved for Pro members.'}
            {' '}Upgrade to unlock advanced AI models.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-4">
          <Button onClick={onUpgrade} size="lg" className="w-full">
            <Zap className="h-4 w-4 mr-2" />
            Upgrade to Pro — $5/mo
          </Button>
          <Button onClick={() => onOpenChange(false)} variant="ghost" className="w-full">
            Use a free model instead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
