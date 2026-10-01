import { useTranslation } from 'react-i18next';
import { Loader2, Play, Square, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { opponentVoice } from '@/lib/voice/opponent-voice';
import { useOpponentVoice } from '@/lib/voice/use-opponent-voice';
import { cn } from '@/lib/utils';

/** Shows that the opponent is speaking, lets the student stop it, and says when the browser voice took over. */
export function OpponentVoiceBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const voice = useOpponentVoice();
  if (voice.status === 'idle' && !voice.notice) return null;

  return (
    <div data-testid="opponent-voice" data-status={voice.status} data-engine={voice.engine ?? undefined} className={cn('rounded-lg border border-border/70 bg-card px-4 py-3 text-sm', className)}>
      {voice.status !== 'idle' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-foreground" role="status" aria-live="polite">
            {voice.status === 'loading'
              ? <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              : <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />}
            {voice.status === 'loading' && t('voiceRound.opponent.loading')}
            {voice.status === 'speaking' && t('voiceRound.opponent.speaking')}
            {voice.status === 'blocked' && t('voiceRound.opponent.blocked')}
          </span>
          <span className="flex items-center gap-2">
            {voice.status === 'blocked' && (
              <Button type="button" size="sm" data-testid="opponent-voice-play" onClick={opponentVoice.unlock}>
                <Play className="h-4 w-4" aria-hidden="true" />
                {t('voiceRound.opponent.play')}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" data-testid="opponent-voice-stop" onClick={opponentVoice.stop}>
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              {t('voiceRound.opponent.stop')}
            </Button>
          </span>
        </div>
      )}
      {voice.notice === 'limit' && (
        <p className={cn('text-xs leading-5 text-muted-foreground', voice.status !== 'idle' && 'mt-2')}>{t('voiceRound.opponent.limit')}</p>
      )}
    </div>
  );
}
