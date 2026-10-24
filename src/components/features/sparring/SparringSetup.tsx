import { useEffect, useMemo, useRef, useState } from 'react';
import { Owl } from '@/components/brand/Owl';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { ArrowRight, Check, ChevronDown, Cpu, Gauge, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DebateContextControl } from '@/components/features/debate/DebateContextControl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useDebateMotionPrefill } from '@/components/features/debate/CurrentDebateStrip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelector } from '@/components/ModelSelector';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/date-format';
import { MAX_MOTION_LENGTH } from '@/lib/stores/debate-store';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  SPARRING_FORMATS,
  buildSparringTurns,
  formatRoundTime,
} from '@/lib/sparring/formats';
import type { SparringDifficulty, SparringFormat, SparringSide } from '@/lib/ai/schemas/sparring';
import { VoiceModeToggle } from '@/components/features/voice/VoiceModeToggle';
import { useVoiceAvailability } from '@/lib/voice/availability';
import { SessionCostNote } from '@/components/features/subscription/SessionCostNote';
import { DailyUsage } from '@/components/features/subscription/DailyUsage';
import { shortfallMessage } from '@/lib/ai/limit-message';

export interface SparringSetupValues {
  motion: string;
  userSide: SparringSide;
  format: SparringFormat;
  difficulty: SparringDifficulty;
  /** Speak the round and hear the opponent, instead of typing. */
  voice: boolean;
}

interface SparringSetupProps {
  /** Offer voice rounds. Off where a round cannot be spoken, such as a workspace. */
  voiceAllowed?: boolean;
  /** Rendered directly below the title, e.g. the Current Debate strip. */
  banner?: React.ReactNode;
  /** Fill the motion from the Current Debate. */
  debatePrefill?: boolean;
  onStart: (values: SparringSetupValues) => void;
  /**
   * AI requests the whole round costs (every reply and the judge), from the
   * server. Null when unknown: an older server charges each reply and the judge.
   */
  roundCost?: number | null;
  /** AI requests left today, or null when unknown. A round that does not fit gets a warning. */
  remainingRequests?: number | null;
  /** Why the server would refuse a new round (weekly allowance, trial ended), translated. */
  blockedReason?: string | null;
  isStarting?: boolean;
  /** Why the last Start did not open a round, translated. */
  startError?: string | null;
  initialValues?: Partial<SparringSetupValues>;
}

const DIFFICULTIES: Array<{ id: SparringDifficulty; name: string }> = [
  { id: 'easy', name: 'Warm-up' },
  { id: 'medium', name: 'Tournament' },
  { id: 'hard', name: 'Ruthless' },
];

export function SparringSetup({ onStart, roundCost = null, remainingRequests = null, blockedReason = null, isStarting = false, startError = null, initialValues, banner, debatePrefill = false, voiceAllowed = true }: SparringSetupProps) {
  const { t } = useTranslation();
  const [motion, setMotion] = useState(initialValues?.motion ?? '');
  const motionRef = useRef(motion);
  motionRef.current = motion;
  useDebateMotionPrefill(() => motionRef.current, setMotion, !debatePrefill);
  const [userSide, setUserSide] = useState<SparringSide>(initialValues?.userSide ?? 'pro');
  const [format, setFormat] = useState<SparringFormat>('standard');
  const [difficulty, setDifficulty] = useState<SparringDifficulty>('medium');
  const [voice, setVoice] = useState(false);
  const voiceAvailability = useVoiceAvailability();
  const isOnline = useOnlineStatus();

  const selectedFormat = useMemo(() => SPARRING_FORMATS.find((item) => item.id === format) ?? SPARRING_FORMATS[0], [format]);
  const plannedTurns = useMemo(() => buildSparringTurns(format, userSide), [format, userSide]);
  const aiRequests = plannedTurns.filter((turn) => turn.speaker === 'ai').length;
  // The whole round (every reply and the judge) is charged once, by model weight.
  // Unknown means an older server may be charging per call, so count that way.
  const cost = roundCost ?? aiRequests + 1;
  const requestShortfall = remainingRequests !== null && remainingRequests < cost;
  const canStart = motion.trim().length >= 8 && !isStarting && isOnline;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canStart) return;
    onStart({ motion: motion.trim(), userSide, format, difficulty, voice: voiceAllowed && voice && voiceAvailability.available });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader className="mb-0" title={t('nav.sparring', 'Sparring')} meta={<DailyUsage />} />
      {banner}

      <form onSubmit={handleSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="border-b-2 border-border bg-brand-tint/50 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-card text-primary shadow-[0_2px_0_var(--do-primary-tint-border)]">
                  <Swords className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>{t('sparring.setup.setMotion', 'Set the motion')}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              <Label htmlFor="sparring-motion" className="text-sm font-medium">{t('sparring.setup.motion', 'Motion')}</Label>
              <Textarea
                id="sparring-motion"
                value={motion}
                onChange={(event) => setMotion(event.target.value)}
                placeholder={t('sparring.setup.motionPlaceholder', 'This house would require social media companies to verify the age of every user.')}
                className="min-h-[132px] resize-y text-base leading-7 md:leading-5"
                maxLength={MAX_MOTION_LENGTH}
                autoFocus
                aria-describedby="sparring-motion-count"
              />
              <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                <span id="sparring-motion-count" className="shrink-0 tabular-nums">{formatNumber(motion.length)}/{formatNumber(MAX_MOTION_LENGTH)}</span>
              </div>
              {motion.length > 0 && motion.trim().length < 8 && (
                <p className="text-sm text-destructive" role="alert">{t('sparring.setup.motionTooShort', 'Add a little more detail so the motion is judgeable.')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>{t('sparring.setup.pickSide', 'Pick your side')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2.5 sm:grid-cols-2">
              {(['pro', 'con'] as const).map((side) => {
                const selected = side === userSide;
                return (
                  <button
                    key={side}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setUserSide(side)}
                    className={cn(
                      'tile min-h-14 rounded-md px-4 py-3 text-left focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    )}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 font-extrabold text-heading">
                        <span className={cn('h-3 w-3 rounded-full', side === 'pro' ? 'bg-brand' : 'bg-destructive')} aria-hidden="true" />
                        {side === 'pro' ? t('sparring.pro', 'Pro') : t('sparring.con', 'Con')}
                      </span>
                      {selected ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white animate-in zoom-in-50 duration-300 ease-overshoot"><Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" /></span> : <span className="h-6 w-6 shrink-0 rounded-full border-2 border-border-strong" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>{t('sparring.setup.choosePressure', 'Choose the pressure')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2.5 md:grid-cols-3">
              {DIFFICULTIES.map((level) => {
                const selected = level.id === difficulty;
                return (
                  <button
                    key={level.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDifficulty(level.id)}
                    className={cn(
                      'tile min-h-14 rounded-md px-4 py-3 text-left focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-extrabold text-heading">
                        <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
                        {t(`sparring.difficulty.${level.id}`, level.name)}
                      </span>
                      {selected && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white animate-in zoom-in-50 duration-300 ease-overshoot"><Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" /></span>}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {voiceAllowed && (
            <VoiceModeToggle
              id="sparring-voice"
              checked={voice}
              onCheckedChange={setVoice}
              description={t('voiceRound.mode.sparringDescription')}
            />
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-2">
                <Label htmlFor="sparring-format" className="text-sm font-medium">{t('sparring.setup.roundFormat', 'Round format')}</Label>
                <Select value={format} onValueChange={(value) => {
                  const nextFormat = SPARRING_FORMATS.find((item) => item.id === value);
                  if (nextFormat) setFormat(nextFormat.id);
                }}>
                  <SelectTrigger id="sparring-format" aria-describedby="sparring-format-details">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPARRING_FORMATS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {t(`sparring.format.${item.id}`, item.name)} · {t('sparring.setup.speeches', '{{count}} speeches', { count: item.turnCount })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p id="sparring-format-details" className="text-xs leading-5 text-muted-foreground">{t(`sparring.formatDescription.${selectedFormat.id}`, selectedFormat.shortDescription)}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-foreground/70">
                <span>{t('sparring.setup.aboutMinutes', 'About {{count}} minutes', { count: selectedFormat.approximateMinutes })}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative mt-16 overflow-visible border-brand-tint-border">
            {/* The opponent, perched on the round card, sizes you up. */}
            <Owl pose="skeptical" size={80} className="absolute -top-[68px] right-4" />
            <CardContent className="space-y-4 pt-6">
              <details className="group rounded-md border-2 border-border bg-surface-sunken/60 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <span className="flex flex-1 items-center justify-between gap-3">
                    <span>{t('sparring.setup.speakingOrder', 'Speaking order')}</span>
                    <Badge variant="outline" className="rounded-md">{t('sparring.setup.turns', '{{count}} turns', { count: selectedFormat.turnCount })}</Badge>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                </summary>
                <ol className="mt-3 space-y-2">
                  {plannedTurns.map((turn, index) => (
                    <li key={turn.id} aria-label={`${index + 1}. ${t(`sparring.turns.${turn.id}`, turn.label)} ${formatRoundTime(turn.timeLimitSeconds)}`} className="flex min-w-0 items-start gap-3 text-sm">
                      <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', turn.speaker === 'user' ? 'bg-primary' : 'bg-muted-foreground/40')} aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-foreground">{t(`sparring.turns.${turn.id}`, turn.label)}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{formatRoundTime(turn.timeLimitSeconds)}</span>
                    </li>
                  ))}
                </ol>
              </details>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border-2 border-border bg-surface-sunken/60 p-3">
                  <p className="text-xs text-muted-foreground">{t('sparring.setup.opponentTurns', 'Opponent turns')}</p>
                  <p className="mt-1 font-display text-2xl font-[600] tabular-nums text-heading">{aiRequests}</p>
                </div>
                <div className="rounded-md border-2 border-border bg-surface-sunken/60 p-3">
                  <p className="text-xs text-muted-foreground">{t('sparring.setup.aiRequests', 'Round cost')}</p>
                  {/* The whole round is one charge (QA bug 7): the number is uses, not one per reply. */}
                  <p data-testid="sparring-round-cost" className="mt-1 font-display text-2xl font-[600] tabular-nums text-heading">
                    {formatNumber(cost)} <span className="text-sm font-medium text-muted-foreground">{t('sparring.setup.roundCostUnit', { count: cost })}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('sparring.setup.aiRequestBreakdown', { count: aiRequests })}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex h-5 items-center gap-2 text-sm font-medium"><Cpu className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t('sparring.setup.aiModel', 'AI model')}</Label>
                <ModelSelector feature="sparring" />
              </div>

              <DebateContextControl feature="sparring" side={userSide} hidden={!debatePrefill} />

              <Button type="submit" variant="accent" size="lg" className="w-full" disabled={!canStart} aria-busy={isStarting}>
                {isStarting && <LoadingSpinner size="sm" />}
                {isStarting ? t('sparring.setup.openingRoom', 'Opening room…') : t('sparring.setup.startRound', 'Start round')}
                {!isStarting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
              {/* The quota check can take a few seconds; say what the wait is for. */}
              {isStarting && (
                <p data-testid="sparring-starting" role="status" className="text-center text-xs leading-5 text-muted-foreground">
                  {t('sparring.setup.checkingQuota', 'Checking your AI uses for today…')}
                </p>
              )}
              {startError && !isStarting && (
                <p data-testid="sparring-start-error" role="alert" className="rounded-md border-2 border-destructive/40 bg-danger-tint px-3 py-2 text-xs leading-5 text-danger-text">
                  {startError}
                </p>
              )}
              {requestShortfall && (
                <p data-testid="sparring-request-shortfall" role="status" className="rounded-md border-2 border-warning/40 bg-warning-tint px-3 py-2 text-xs leading-5 text-warning-text">
                  {/* The server's refusal when it answered, else the same words from the browser's count (QB-06). */}
                  {blockedReason ?? shortfallMessage(cost, remainingRequests)}
                </p>
              )}
              {/* The shortfall note above already explains a day that is used up. */}
              <SessionCostNote units={roundCost} remaining={remainingRequests} blocked={requestShortfall ? null : blockedReason} className="text-center" />
              {!isOnline && <p className="text-center text-xs leading-5 text-amber-700 dark:text-amber-300">{t('sparring.setup.offlineCannotStart', 'Reconnect to start a round. Your setup is kept while you are offline.')}</p>}
              <p className="text-center text-xs leading-5 text-muted-foreground">{t('sparring.setup.draftNotice', 'Your draft is saved locally as you type. You can pause without losing your place.')}</p>
            </CardContent>
          </Card>
        </aside>
      </form>
    </div>
  );
}
