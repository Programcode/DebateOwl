import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Clock3, CloudOff, Cpu, Gauge, Radio, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ModelSelector } from '@/components/ModelSelector';
import { cn } from '@/lib/utils';
import {
  SPARRING_FORMATS,
  buildSparringTurns,
  formatRoundTime,
} from '@/lib/sparring/formats';
import type { SparringDifficulty, SparringFormat, SparringSide } from '@/lib/ai/schemas/sparring';

export interface SparringSetupValues {
  motion: string;
  userSide: SparringSide;
  format: SparringFormat;
  difficulty: SparringDifficulty;
}

interface SparringSetupProps {
  onStart: (values: SparringSetupValues) => void;
  isStarting?: boolean;
}

const DIFFICULTIES: Array<{ id: SparringDifficulty; name: string; description: string }> = [
  { id: 'easy', name: 'Warm-up', description: 'Clear arguments and generous openings.' },
  { id: 'medium', name: 'Tournament', description: 'A capable opponent who follows the flow.' },
  { id: 'hard', name: 'Ruthless', description: 'Fast counters that look for every gap.' },
];

export function SparringSetup({ onStart, isStarting = false }: SparringSetupProps) {
  const { t } = useTranslation();
  const [motion, setMotion] = useState('');
  const [userSide, setUserSide] = useState<SparringSide>('pro');
  const [format, setFormat] = useState<SparringFormat>('standard');
  const [difficulty, setDifficulty] = useState<SparringDifficulty>('medium');
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const selectedFormat = useMemo(() => SPARRING_FORMATS.find((item) => item.id === format) ?? SPARRING_FORMATS[0], [format]);
  const plannedTurns = useMemo(() => buildSparringTurns(format, userSide), [format, userSide]);
  const aiRequests = plannedTurns.filter((turn) => turn.speaker === 'ai').length;
  const totalRequests = aiRequests + 1;
  const canStart = motion.trim().length >= 8 && !isStarting && isOnline;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canStart) return;
    onStart({ motion: motion.trim(), userSide, format, difficulty });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            {t('sparring.setup.liveLabel', 'Live practice room')}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t('sparring.setup.heading', 'Spar with an opponent who listens.')}</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            {t('sparring.setup.subtitle', 'Choose a motion, take a side, and work through a timed round. The AI keeps the transcript in view, answers the arguments you actually make, and scores the written debate at the end.')}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {isOnline ? <Radio className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> : <CloudOff className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
          {isOnline ? t('sparring.setup.onlineReady', 'Ready to call the debate coach') : t('sparring.setup.offlineDraft', 'Offline. Your draft stays in this tab.')}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="overflow-hidden border-primary/20 shadow-sm">
            <CardHeader className="border-b border-border/60 bg-primary/[0.035] pb-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Swords className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-xl">{t('sparring.setup.setMotion', 'Set the motion')}</CardTitle>
                  <CardDescription className="mt-1">{t('sparring.setup.setMotionDescription', 'Write the resolution as you would hear it in the room.')}</CardDescription>
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
                className="min-h-[132px] resize-y text-base leading-7"
                maxLength={1200}
                autoFocus
                aria-describedby="sparring-motion-help sparring-motion-count"
              />
              <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                <span id="sparring-motion-help">{t('sparring.setup.motionHelp', 'A precise motion gives the opponent something concrete to attack.')}</span>
                <span id="sparring-motion-count" className="shrink-0 tabular-nums">{motion.length}/1,200</span>
              </div>
              {motion.length > 0 && motion.trim().length < 8 && (
                <p className="text-sm text-destructive" role="alert">{t('sparring.setup.motionTooShort', 'Add a little more detail so the motion is judgeable.')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{t('sparring.setup.pickSide', 'Pick your side')}</CardTitle>
              <CardDescription>{t('sparring.setup.pickSideDescription', 'You will write every speech for the side you choose.')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(['pro', 'con'] as const).map((side) => {
                const selected = side === userSide;
                return (
                  <button
                    key={side}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setUserSide(side)}
                    className={cn(
                      'motion-press rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selected ? 'border-primary bg-primary/10 text-foreground shadow-sm' : 'border-border bg-background hover:border-primary/40 hover:bg-accent/50',
                    )}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className={cn('h-2.5 w-2.5 rounded-full', side === 'pro' ? 'bg-emerald-500' : 'bg-rose-500')} aria-hidden="true" />
                        {side === 'pro' ? t('sparring.pro', 'Pro') : t('sparring.con', 'Con')}
                      </span>
                      {selected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                    </span>
                    <span className="mt-2 block text-sm leading-5 text-muted-foreground">
                      {side === 'pro' ? t('sparring.setup.proDescription', 'Defend the resolution and show why it should pass.') : t('sparring.setup.conDescription', 'Challenge the resolution and show why it should fail.')}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{t('sparring.setup.choosePressure', 'Choose the pressure')}</CardTitle>
              <CardDescription>{t('sparring.setup.choosePressureDescription', 'The opponent adapts its arguments to this level.')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {DIFFICULTIES.map((level) => {
                const selected = level.id === difficulty;
                return (
                  <button
                    key={level.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDifficulty(level.id)}
                    className={cn(
                      'motion-press rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selected ? 'border-primary bg-primary/10 shadow-sm' : 'border-border hover:border-primary/40 hover:bg-accent/50',
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
                      {t(`sparring.difficulty.${level.id}`, level.name)}
                    </span>
                    <span className="mt-2 block text-sm leading-5 text-muted-foreground">{t(`sparring.setup.difficultyDescription.${level.id}`, level.description)}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{t('sparring.setup.roundFormat', 'Round format')}</CardTitle>
                  <CardDescription className="mt-1">{t('sparring.setup.roundFormatDescription', 'Set the speaking order.')}</CardDescription>
                </div>
                <Clock3 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {SPARRING_FORMATS.map((item) => {
                const selected = item.id === format;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFormat(item.id)}
                    className={cn(
                      'motion-press w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-accent/50',
                    )}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{t(`sparring.format.${item.id}`, item.name)} · {t('sparring.setup.speeches', '{{count}} speeches', { count: item.turnCount })}</span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(`sparring.formatDescription.${item.id}`, item.shortDescription)}</span>
                    <span className="mt-2 block text-xs font-medium text-foreground/70">{t('sparring.setup.aboutMinutes', 'About {{count}} minutes', { count: item.approximateMinutes })}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/[0.025]">
            <CardHeader className="pb-4">
                  <CardTitle className="text-lg">{t('sparring.setup.roomAtGlance', 'Your room, at a glance')}</CardTitle>
                  <CardDescription>{t(`sparring.format.${selectedFormat.id}`, selectedFormat.name)} round · {userSide === 'pro' ? t('sparring.pro', 'Pro') : t('sparring.con', 'Con')} side · {t(`sparring.difficulty.${difficulty}`, difficulty)} pressure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('sparring.setup.speakingPlan', 'Speaking plan')}</span>
                  <Badge variant="outline" className="rounded-md text-[10px]">{t('sparring.setup.turns', '{{count}} turns', { count: selectedFormat.turnCount })}</Badge>
                </div>
                <ol className="mt-3 space-y-2">
                  {plannedTurns.map((turn, index) => (
                    <li key={turn.id} className="flex items-center gap-3 text-sm">
                      <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', turn.speaker === 'user' ? 'bg-primary' : 'bg-muted-foreground/40')} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{t(`sparring.turns.${turn.id}`, turn.label)}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{formatRoundTime(turn.timeLimitSeconds)}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">{t('sparring.setup.opponentTurns', 'Opponent turns')}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{aiRequests}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">{t('sparring.setup.aiRequests', 'AI requests')}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{totalRequests}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t('sparring.setup.aiRequestBreakdown', '{{count}} replies + 1 judge', { count: aiRequests })}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium"><Cpu className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t('sparring.setup.aiModel', 'AI model')}</Label>
                <ModelSelector feature="sparring" />
                <p className="text-xs leading-5 text-muted-foreground">{t('sparring.setup.modelHelp', 'Model settings follow the sparring profile in Settings.')}</p>
              </div>

              <Button type="submit" className="h-12 w-full" disabled={!canStart}>
                {isStarting ? t('sparring.setup.openingRoom', 'Opening room…') : t('sparring.setup.startRound', 'Start round')}
                {!isStarting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
              {!isOnline && <p className="text-center text-xs leading-5 text-amber-700 dark:text-amber-300">{t('sparring.setup.offlineCannotStart', 'Reconnect to start a round. Your setup is kept while you are offline.')}</p>}
              <p className="text-center text-xs leading-5 text-muted-foreground">{t('sparring.setup.draftNotice', 'Your draft is saved locally as you type. You can pause without losing your place.')}</p>
            </CardContent>
          </Card>
        </aside>
      </form>
    </div>
  );
}
