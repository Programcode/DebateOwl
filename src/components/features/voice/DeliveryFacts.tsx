import { useTranslation } from 'react-i18next';
import { formatRoundTime } from '@/lib/sparring/formats';
import { LONG_PAUSE_SECONDS, type SpeechDelivery } from '@/lib/voice/delivery';

interface DeliveryFactsProps {
  delivery: SpeechDelivery;
  /** The turn's time limit, when the turn has one of its own. */
  timeLimitSeconds?: number;
}

/** The measured facts of a spoken turn. It states numbers and nothing about how the speaker sounded. */
export function DeliveryFacts({ delivery, timeLimitSeconds }: DeliveryFactsProps) {
  const { t } = useTranslation();
  const facts: Array<[string, string]> = [
    [
      t('voiceRound.delivery.speakingTime'),
      timeLimitSeconds
        ? t('voiceRound.delivery.timeOfLimit', { used: formatRoundTime(delivery.speakingSeconds), limit: formatRoundTime(timeLimitSeconds) })
        : formatRoundTime(delivery.speakingSeconds),
    ],
    [t('voiceRound.delivery.pace'), t('voiceRound.delivery.wordsPerMinute', { count: delivery.wordsPerMinute })],
    [
      t('voiceRound.delivery.fillers'),
      delivery.fillers.length > 0
        ? `${delivery.fillerCount} (${delivery.fillers.map((filler) => `${filler.word} × ${filler.count}`).join(', ')})`
        : String(delivery.fillerCount),
    ],
    [
      t('voiceRound.delivery.longPauses', { seconds: LONG_PAUSE_SECONDS }),
      delivery.longPauses > 0
        ? t('voiceRound.delivery.pausesWithLongest', { count: delivery.longPauses, seconds: delivery.longestPauseSeconds })
        : String(delivery.longPauses),
    ],
  ];
  return (
    <dl data-testid="delivery-facts" className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {facts.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-1.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-mono text-xs tabular-nums text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
