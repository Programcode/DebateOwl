import { useTranslation } from 'react-i18next';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpeechCapture, SpeechCaptureError } from '@/hooks/use-speech-capture';
import { cn } from '@/lib/utils';
import { ListeningIndicator } from './ListeningIndicator';

const ERROR_KEYS: Record<SpeechCaptureError, string> = {
  'not-allowed': 'voiceRound.mic.notAllowed',
  'no-microphone': 'voiceRound.mic.noMicrophone',
  network: 'voiceRound.mic.network',
  'start-failed': 'voiceRound.mic.startFailed',
};

interface VoiceMicControlProps {
  capture: SpeechCapture;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  className?: string;
}

/** The microphone button for a spoken turn, with the words heard so far. */
export function VoiceMicControl({ capture, onStart, onStop, disabled = false, className }: VoiceMicControlProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          data-testid="voice-mic"
          variant={capture.listening ? 'destructive' : 'outline'}
          aria-pressed={capture.listening}
          onClick={capture.listening ? onStop : onStart}
          disabled={disabled}
        >
          {capture.listening ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
          {capture.listening ? t('voiceRound.mic.stop') : t('voiceRound.mic.start')}
        </Button>
        {capture.listening && (
          <ListeningIndicator label={t('voiceRound.mic.listening')} />
        )}
      </div>
      {capture.listening && capture.interim && (
        <p data-testid="voice-interim" className="text-sm italic leading-6 text-muted-foreground">{capture.interim}</p>
      )}
      {capture.error && <p className="text-sm text-destructive" role="alert">{t(ERROR_KEYS[capture.error])}</p>}
    </div>
  );
}
