import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BUILT_IN_FORMATS, formatDuration } from '@/lib/free-tools/formats';
import { countWords, MAX_WPM, MIN_WPM, PACES, slotFits, spokenSeconds } from '@/lib/free-tools/speech-time';
import { captureProductEvent } from '@/lib/observability';
import { cn } from '@/lib/utils';

const describeSpare = (spare: number) => (spare >= 0 ? formatDuration(spare) : formatDuration(-spare));

export function SpeechTimeCalculator() {
  const { t } = useTranslation('tools');
  const [text, setText] = useState('');
  const [customWpm, setCustomWpm] = useState(140);
  const [fitPace, setFitPace] = useState<number>(130);
  const reported = useRef(false);

  const words = countWords(text);
  const wpm = Math.min(MAX_WPM, Math.max(MIN_WPM, customWpm || MIN_WPM));
  const fits = words > 0 ? slotFits(words, fitPace, BUILT_IN_FORMATS) : [];

  useEffect(() => {
    if (words === 0 || reported.current) return;
    reported.current = true;
    captureProductEvent('free_tool_used', { freeTool: 'speech-time-calculator', action: 'calculate' });
  }, [words]);

  const paceOptions = [...PACES.map((pace) => ({ id: pace.id, wpm: pace.wpm })), { id: 'custom', wpm }];

  return (
    <section aria-label={t('calc.region')} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="speech-text">
        {t('calc.paste')}
      </label>
      <textarea
        id="speech-text"
        className="mt-2 min-h-48 w-full rounded-md border border-input bg-background p-3 text-base leading-relaxed"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('calc.placeholder')}
        spellCheck
      />
      <p className="mt-1 text-xs text-muted-foreground">{t('calc.privacy')}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="rounded-xl border border-border bg-background p-4 text-center sm:min-w-40" aria-live="polite">
          <div className="text-4xl font-bold tabular-nums" data-testid="word-count">{words}</div>
          <div className="text-sm text-muted-foreground">{t('calc.words', { count: words })}</div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t('calc.durations')}>
          {paceOptions.map((pace) => (
            <li key={pace.id} className="rounded-xl border border-border bg-background p-4">
              <div className="text-sm text-muted-foreground">{t(`calc.pace.${pace.id}`)}</div>
              <div className="text-2xl font-semibold tabular-nums">{formatDuration(spokenSeconds(words, pace.wpm))}</div>
              {pace.id === 'custom' ? (
                <label className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="number"
                    min={MIN_WPM}
                    max={MAX_WPM}
                    value={customWpm}
                    onChange={(event) => setCustomWpm(Number(event.target.value))}
                    className="h-8 w-16 rounded border border-input bg-background px-1 text-sm text-foreground"
                    aria-label={t('calc.customWpm')}
                  />
                  {t('calc.wpm')}
                </label>
              ) : (
                <div className="text-xs text-muted-foreground">{pace.wpm} {t('calc.wpm')}</div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('calc.approximate')}</p>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('calc.fitsTitle')}</h2>
          <label className="flex items-center gap-2 text-sm">
            {t('calc.fitsAt')}
            <select className="h-9 rounded-md border border-input bg-background px-2" value={fitPace} onChange={(event) => setFitPace(Number(event.target.value))}>
              {paceOptions.map((pace) => <option key={pace.id} value={pace.wpm}>{t(`calc.pace.${pace.id}`)} ({pace.wpm} {t('calc.wpm')})</option>)}
            </select>
          </label>
        </div>
        {fits.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('calc.fitsEmpty')}</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="slot-fits">
            {fits.map((fit) => (
              <li key={`${fit.formatId}-${fit.slotSeconds}`} className={cn('flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-sm', fit.fits ? 'border-emerald-600/40 bg-emerald-50 dark:bg-emerald-400/10' : 'border-border bg-background')}>
                <span>
                  <span className="font-medium">{fit.formatShortName} {formatDuration(fit.slotSeconds)}</span>{' '}
                  <span className="text-muted-foreground">{fit.roles}</span>
                </span>
                <span className={cn('shrink-0 tabular-nums', fit.fits ? 'text-emerald-800 dark:text-emerald-300' : 'text-destructive')}>
                  {fit.fits ? t('calc.spare', { time: describeSpare(fit.spareSeconds) }) : t('calc.over', { time: describeSpare(fit.spareSeconds) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
