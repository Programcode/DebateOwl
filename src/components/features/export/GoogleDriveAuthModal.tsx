import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/supabase/AuthProvider';
import GoogleDocsIcon from '@/components/icons/GoogleDocsIcon';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GoogleDriveAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoogleDriveAuthModal({ open, onOpenChange }: GoogleDriveAuthModalProps) {
  const { t } = useTranslation();
  const { signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await signInWithGoogle({ driveAccess: true });
    } catch (error) {
      setIsConnecting(false);
      toast({
        title: t('googleDriveAuth.failedTitle', 'Could not open Google'),
        description: error instanceof Error ? error.message : t('googleDriveAuth.failedDesc', 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[430px]">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <GoogleDocsIcon className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">
            {t('googleDriveAuth.title', 'Connect Google Drive')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t(
              'googleDriveAuth.description',
              'To export to Google Docs, DebateLab needs permission to create files in your Google Drive.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t(
              'googleDriveAuth.scopeNote',
              'We request the limited drive.file permission, not full Drive access.'
            )}
          </div>
          <Button onClick={() => void handleConnect()} disabled={isConnecting} size="lg" className="w-full">
            {isConnecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            {isConnecting
              ? t('googleDriveAuth.redirecting', 'Redirecting...')
              : t('googleDriveAuth.connect', 'Connect Google Drive')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
