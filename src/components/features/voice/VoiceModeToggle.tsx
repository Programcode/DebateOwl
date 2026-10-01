import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useVoiceAvailability, useVoiceAvailabilityStore } from '@/lib/voice/availability';
import { opponentVoice } from '@/lib/voice/opponent-voice';

interface VoiceModeToggleProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** What a voice round means for this tool. */
  description: string;
}

/**
 * Turns a round into a spoken one. Where the browser cannot recognise speech,
 * or the microphone is blocked, the switch is replaced by a short reason. The
 * first time it is switched on, it says where the audio and text go.
 */
export function VoiceModeToggle({ id, checked, onCheckedChange, description }: VoiceModeToggleProps) {
  const { t } = useTranslation();
  const availability = useVoiceAvailability();
  const noticeAcknowledged = useVoiceAvailabilityStore((state) => state.noticeAcknowledged);
  const acknowledgeNotice = useVoiceAvailabilityStore((state) => state.acknowledgeNotice);
  const [noticeOpen, setNoticeOpen] = useState(false);

  if (!availability.available) {
    return (
      <p data-testid="voice-unavailable" className="text-xs leading-5 text-muted-foreground">
        {availability.reason === 'denied' ? t('voiceRound.unavailable.denied') : t('voiceRound.unavailable.unsupported')}
      </p>
    );
  }

  const turnOn = () => {
    // This click is the gesture that lets the opponent's audio play later.
    opponentVoice.unlock();
    onCheckedChange(true);
  };

  return (
    <div className="rounded-lg border border-border/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor={id} className="flex cursor-pointer items-center gap-2">
            <Mic className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('voiceRound.mode.label')}
          </Label>
          <p className="text-sm text-muted-foreground">{description}</p>
          {checked && <p className="text-xs leading-5 text-muted-foreground">{t('voiceRound.mode.privacyLine')}</p>}
        </div>
        <Switch
          id={id}
          data-testid="voice-mode"
          checked={checked}
          onCheckedChange={(next) => {
            if (!next) onCheckedChange(false);
            else if (noticeAcknowledged) turnOn();
            else setNoticeOpen(true);
          }}
        />
      </div>

      <AlertDialog open={noticeOpen} onOpenChange={setNoticeOpen}>
        <AlertDialogContent data-testid="voice-notice">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('voiceRound.notice.title')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="list-disc space-y-2 pl-5 text-left text-sm text-muted-foreground">
                <li>{t('voiceRound.notice.noRecording')}</li>
                <li>{t('voiceRound.notice.recognition')}</li>
                <li>{t('voiceRound.notice.opponent')}</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                acknowledgeNotice();
                turnOn();
              }}
            >
              {t('voiceRound.notice.accept')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
