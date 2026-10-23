import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dices, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PRACTICE_MOTIONS } from '@/lib/free-tools/practice-motions';
import { MOTION_DIFFICULTIES, MOTION_TOPICS, MOTION_TYPES, type PracticeMotion } from '@/lib/free-tools/motion-types';
import {
  drawMotions,
  filterMotions,
  filtersFromSearch,
  motionsFromSearch,
  motionText,
  NO_FILTERS,
  searchFor,
  TOPIC_NAMES,
  type MotionFilters,
  type MotionWording,
} from '@/lib/free-tools/motion-bank';
import { captureProductEvent } from '@/lib/observability';
import { cn } from '@/lib/utils';

interface GeneratorState {
  filters: MotionFilters;
  shown: PracticeMotion[];
  wording: MotionWording;
}

function fromUrl(): GeneratorState {
  if (typeof window === 'undefined') return { filters: NO_FILTERS, shown: [], wording: 'house' };
  const { search } = window.location;
  return {
    filters: filtersFromSearch(search),
    shown: motionsFromSearch(PRACTICE_MOTIONS, search),
    wording: new URLSearchParams(search).get('wording') === 'resolved' ? 'resolved' : 'house',
  };
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-full border px-3 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11',
        pressed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

export function MotionGenerator() {
  const { t } = useTranslation('tools');
  const [state, setState] = useState<GeneratorState>(fromUrl);
  const [copied, setCopied] = useState<string | null>(null);
  const { filters, shown, wording } = state;
  const pool = filterMotions(PRACTICE_MOTIONS, filters);

  useEffect(() => {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${searchFor(filters, shown.map((motion) => motion.id), wording)}${window.location.hash}`);
  }, [filters, shown, wording]);

  const draw = (count: number) => {
    setState((current) => ({ ...current, shown: drawMotions(filterMotions(PRACTICE_MOTIONS, current.filters), count, Math.random, current.shown.map((motion) => motion.id)) }));
    captureProductEvent('free_tool_used', { freeTool: 'debate-motion-generator', action: 'draw' });
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt(t('motions.copyPrompt'), text);
    }
  };

  const setFilters = (change: (current: MotionFilters) => MotionFilters) => setState((current) => ({ ...current, filters: change(current.filters) }));

  return (
    <section aria-label={t('motions.region')} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="space-y-4">
        <fieldset>
          <legend className="text-sm font-medium">{t('motions.topic')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOTION_TOPICS.map((topic) => (
              <Chip key={topic} pressed={filters.topics.includes(topic)} onClick={() => setFilters((current) => ({ ...current, topics: toggle(current.topics, topic) }))}>
                {t(`motions.topics.${topic}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-6">
          <fieldset>
            <legend className="text-sm font-medium">{t('motions.difficulty')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOTION_DIFFICULTIES.map((level) => (
                <Chip key={level} pressed={filters.difficulties.includes(level)} onClick={() => setFilters((current) => ({ ...current, difficulties: toggle(current.difficulties, level) }))}>
                  {t(`motions.difficulties.${level}`)}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">{t('motions.type')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOTION_TYPES.map((type) => (
                <Chip key={type} pressed={filters.types.includes(type)} onClick={() => setFilters((current) => ({ ...current, types: toggle(current.types, type) }))}>
                  {t(`motions.types.${type}`)}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">{t('motions.wording')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip pressed={wording === 'house'} onClick={() => setState((current) => ({ ...current, wording: 'house' }))}>{t('motions.wordingHouse')}</Chip>
              <Chip pressed={wording === 'resolved'} onClick={() => setState((current) => ({ ...current, wording: 'resolved' }))}>{t('motions.wordingResolved')}</Chip>
            </div>
          </fieldset>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => draw(1)} disabled={pool.length === 0}><Dices className="mr-2 h-5 w-5" />{t('motions.drawOne')}</Button>
          <Button size="lg" variant="outline" onClick={() => draw(3)} disabled={pool.length < 3}><Shuffle className="mr-2 h-5 w-5" />{t('motions.drawThree')}</Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">{t('motions.poolSize', { count: pool.length })}</span>
          {(filters.topics.length + filters.difficulties.length + filters.types.length) > 0 && (
            <Button variant="link" size="sm" onClick={() => setFilters(() => NO_FILTERS)}>{t('motions.clearFilters')}</Button>
          )}
        </div>
      </div>

      {/* Announce only the drawn motions, not every card's buttons. */}
      <p className="sr-only" aria-live="polite">{shown.map((motion) => motionText(motion, wording)).join('. ')}</p>
      <div className="mt-6">
        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">{t('motions.empty')}</p>
        ) : (
          <ol className={cn('grid gap-4', shown.length > 1 && 'lg:grid-cols-3')}>
            {shown.map((motion, index) => {
              const text = motionText(motion, wording);
              const link = `${window.location.origin}${window.location.pathname}${searchFor(NO_FILTERS, [motion.id], wording)}`;
              return (
                <li key={motion.id} className="flex flex-col rounded-xl border border-border bg-background p-5">
                  {shown.length > 1 && <span className="text-sm text-muted-foreground">{t('motions.optionN', { n: index + 1 })}</span>}
                  <p className="mt-1 text-xl font-semibold leading-snug">{text}</p>
                  {motion.infoSlide && <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{t('motions.infoSlide')}</span> {motion.infoSlide}</p>}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t(`motions.topics.${motion.topic}`)}, {t(`motions.difficulties.${motion.difficulty}`)}, {t(`motions.types.${motion.type}`)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void copy(`${motion.id}-text`, text)}>
                      {copied === `${motion.id}-text` ? t('motions.copied') : t('motions.copy')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void copy(`${motion.id}-link`, link)}>
                      {copied === `${motion.id}-link` ? t('motions.copied') : t('motions.copyLink')}
                    </Button>
                  </div>
                  <Link to="/login" className="mt-4 text-sm font-medium text-primary underline underline-offset-4">{t('motions.prepCta')}</Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
