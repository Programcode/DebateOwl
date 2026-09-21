import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Bell, Volume2, VolumeX, Keyboard } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DebateFormat {
  id: string;
  nameKey: string;
  speeches: {
    id: string;
    labelKey: string;
    minutes: number;
    color: string;
  }[];
}

const FORMATS: DebateFormat[] = [
  {
    id: 'standard',
    nameKey: 'timer.formatStandard',
    speeches: [
      { id: 'intro', labelKey: 'timer.speeches.standard.intro', minutes: 4, color: 'bg-blue-500' },
      { id: 'r1', labelKey: 'timer.speeches.standard.r1', minutes: 6, color: 'bg-orange-500' },
      { id: 'r2', labelKey: 'timer.speeches.standard.r2', minutes: 6, color: 'bg-red-500' },
      { id: 'conc', labelKey: 'timer.speeches.standard.conc', minutes: 3, color: 'bg-green-500' },
    ]
  },
  {
    id: 'ld',
    nameKey: 'timer.formatLD',
    speeches: [
      { id: 'ac', labelKey: 'timer.speeches.ld.ac', minutes: 6, color: 'bg-blue-500' },
      { id: 'nc', labelKey: 'timer.speeches.ld.nc', minutes: 7, color: 'bg-red-500' },
      { id: 'ar1', labelKey: 'timer.speeches.ld.ar1', minutes: 4, color: 'bg-blue-400' },
      { id: 'nr', labelKey: 'timer.speeches.ld.nr', minutes: 6, color: 'bg-red-400' },
      { id: 'ar2', labelKey: 'timer.speeches.ld.ar2', minutes: 3, color: 'bg-blue-600' },
    ]
  },
  {
    id: 'pf',
    nameKey: 'timer.formatPF',
    speeches: [
      { id: 'team1_c', labelKey: 'timer.speeches.pf.team1c', minutes: 4, color: 'bg-blue-500' },
      { id: 'team2_c', labelKey: 'timer.speeches.pf.team2c', minutes: 4, color: 'bg-red-500' },
      { id: 'team1_r', labelKey: 'timer.speeches.pf.team1r', minutes: 4, color: 'bg-blue-400' },
      { id: 'team2_r', labelKey: 'timer.speeches.pf.team2r', minutes: 4, color: 'bg-red-400' },
      { id: 'team1_s', labelKey: 'timer.speeches.pf.team1s', minutes: 3, color: 'bg-blue-600' },
      { id: 'team2_s', labelKey: 'timer.speeches.pf.team2s', minutes: 3, color: 'bg-red-600' },
      { id: 'team1_ff', labelKey: 'timer.speeches.pf.team1ff', minutes: 2, color: 'bg-blue-700' },
      { id: 'team2_ff', labelKey: 'timer.speeches.pf.team2ff', minutes: 2, color: 'bg-red-700' },
    ]
  },
  {
    id: 'policy',
    nameKey: 'timer.formatPolicy',
    speeches: [
      { id: '1ac', labelKey: 'timer.speeches.policy.1ac', minutes: 8, color: 'bg-blue-500' },
      { id: '1nc', labelKey: 'timer.speeches.policy.1nc', minutes: 8, color: 'bg-red-500' },
      { id: '2ac', labelKey: 'timer.speeches.policy.2ac', minutes: 8, color: 'bg-blue-400' },
      { id: '2nc', labelKey: 'timer.speeches.policy.2nc', minutes: 8, color: 'bg-red-400' },
      { id: '1nr', labelKey: 'timer.speeches.policy.1nr', minutes: 5, color: 'bg-red-600' },
      { id: '1ar', labelKey: 'timer.speeches.policy.1ar', minutes: 5, color: 'bg-blue-600' },
      { id: '2nr', labelKey: 'timer.speeches.policy.2nr', minutes: 5, color: 'bg-red-700' },
      { id: '2ar', labelKey: 'timer.speeches.policy.2ar', minutes: 5, color: 'bg-blue-700' },
    ]
  }
];

let audioContext: AudioContext | null = null;

// Simple audio synth
const playSignal = async (type: 'beep' | 'double-beep' | 'alarm') => {
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    audioContext ??= new AudioContextCtor();
    const ctx = audioContext;
    if (ctx.state === 'suspended') await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'beep') {
      osc.frequency.setValueAtTime(880, now); // A5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'double-beep') {
      // First beep
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.setValueAtTime(0, now + 0.1);

      // Second beep
      osc.frequency.setValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.1, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.start(now);
      osc.stop(now + 0.6);
    } else if (type === 'alarm') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

export default function TimerPage() {
  const { t } = useTranslation();
  const [formatId, setFormatId] = useState('standard');
  const [currentSpeechIdx, setCurrentSpeechIdx] = useState(0);

  const currentFormat = FORMATS.find(f => f.id === formatId) || FORMATS[0];
  const currentSpeech = currentFormat.speeches[currentSpeechIdx] || currentFormat.speeches[0];

  const [timeLeft, setTimeLeft] = useState(currentSpeech.minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const timeLeftRef = useRef(timeLeft);
  const previousTimeLeftRef = useRef(timeLeft);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // Reset when format changes
  useEffect(() => {
    setCurrentSpeechIdx(0);
    setIsRunning(false);
    setIsFinished(false);
    const firstSpeech = currentFormat.speeches[0];
    setTimeLeft(firstSpeech.minutes * 60);
  }, [formatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety check if index is out of bounds for new format
  useEffect(() => {
    if (!currentFormat.speeches[currentSpeechIdx]) {
      setCurrentSpeechIdx(0);
      setIsRunning(false);
      setIsFinished(false);
      setTimeLeft(currentFormat.speeches[0].minutes * 60);
    }
  }, [currentFormat, currentSpeechIdx]);

  // Drives the countdown off a deadline timestamp (self-correcting against
  // setInterval drift/throttling) and only recreates the interval when
  // isRunning changes, not on every tick. The updater stays pure — no
  // side effects here; see the effect below for signals/completion.
  useEffect(() => {
    if (!isRunning || timeLeftRef.current <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      deadlineRef.current = null;
      return;
    }

    deadlineRef.current = Date.now() + timeLeftRef.current * 1000;
    timerRef.current = setInterval(() => {
      if (deadlineRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isRunning]);

  // Reacts to the countdown value to trigger signals and mark completion.
  useEffect(() => {
    const previousTimeLeft = previousTimeLeftRef.current;
    previousTimeLeftRef.current = timeLeft;
    if (!isRunning) return;
    if (soundEnabled) {
      if (previousTimeLeft > 60 && timeLeft <= 60 && timeLeft > 0) void playSignal('beep');
      if (timeLeft === 0) void playSignal('double-beep');
    }
    if (timeLeft === 0) {
      setIsRunning(false);
      setIsFinished(true);
    }
  }, [timeLeft, isRunning, soundEnabled]);

  const toggleTimer = useCallback(() => setIsRunning(prev => !prev), []);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setIsFinished(false);
    const speech = currentFormat.speeches[currentSpeechIdx] || currentFormat.speeches[0];
    setTimeLeft(speech.minutes * 60);
  }, [currentFormat, currentSpeechIdx]);

  const nextSpeech = useCallback(() => {
    if (currentSpeechIdx < currentFormat.speeches.length - 1) {
      setCurrentSpeechIdx(prev => prev + 1);
      setIsRunning(false);
      setIsFinished(false);
      const nextSpeechObj = currentFormat.speeches[currentSpeechIdx + 1];
      setTimeLeft(nextSpeechObj.minutes * 60);
    }
  }, [currentSpeechIdx, currentFormat]);

  const prevSpeech = useCallback(() => {
    if (currentSpeechIdx > 0) {
      setCurrentSpeechIdx(prev => prev - 1);
      setIsRunning(false);
      setIsFinished(false);
      const prevSpeechObj = currentFormat.speeches[currentSpeechIdx - 1];
      setTimeLeft(prevSpeechObj.minutes * 60);
    }
  }, [currentSpeechIdx, currentFormat]);

  const handleSpeechSelect = (idx: number) => {
    setCurrentSpeechIdx(idx);
    setIsRunning(false);
    setIsFinished(false);
    const speech = currentFormat.speeches[idx];
    setTimeLeft(speech.minutes * 60);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          toggleTimer();
          break;
        case 'KeyR':
        case 'Escape':
          resetTimer();
          break;
        case 'ArrowRight':
          nextSpeech();
          break;
        case 'ArrowLeft':
          prevSpeech();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTimer, resetTimer, nextSpeech, prevSpeech]);

  const totalDuration = (currentSpeech.minutes || 0) * 60;
  const progress = Math.min(100, Math.max(0, ((totalDuration - timeLeft) / totalDuration) * 100));

  return (
    <div className="container py-8 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('timer.title')}</h1>
        </div>

        <div className="flex justify-between items-center mb-6 max-w-xl mx-auto">
          <Select value={formatId} onValueChange={(val) => {
            setFormatId(val);
          }}>
            <SelectTrigger className="w-[200px]" aria-label={t('timer.selectFormat', 'Select debate format')}>
              <SelectValue placeholder={t('timer.selectFormat')} />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map(f => (
                <SelectItem key={f.id} value={f.id}>{t(f.nameKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            aria-label={soundEnabled ? t('timer.disableSound', 'Disable sound') : t('timer.enableSound', 'Enable sound')}
          >
            {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
          </Button>
        </div>

        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <div className="flex justify-center gap-2 mb-4 flex-wrap">
              {currentFormat.speeches.map((s, idx) => (
                <Button
                  key={s.id}
                  variant={idx === currentSpeechIdx ? "default" : "outline"}
                  data-state={idx === currentSpeechIdx ? "active" : "inactive"}
                  onClick={() => handleSpeechSelect(idx)}
                  className={`transition-all data-[state=active]:ring-2 data-[state=active]:ring-primary data-[state=active]:ring-offset-2 ${idx === currentSpeechIdx ? s.color : "opacity-70 hover:opacity-100"}`}
                  size="sm"
                >
                  {t(s.labelKey)} ({s.minutes}m)
                </Button>
              ))}
            </div>
            <CardTitle className="sr-only">{t('timer.displayLabel')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Timer Display */}
            <div className="relative flex items-center justify-center h-64 w-64 sm:h-72 sm:w-72 mx-auto rounded-full border-8 border-muted bg-background/50 shadow-inner transition-all" role="timer" aria-live="polite" aria-atomic="true">
              <div className={`absolute inset-0 rounded-full border-8 border-primary transition-all duration-1000`}
                style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }} />

              <div className="text-center z-10 flex flex-col items-center justify-center">
                <div className={`text-6xl sm:text-7xl font-mono font-bold tracking-tighter tabular-nums transition-colors duration-300 ${timeLeft < 30 && timeLeft > 0 ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-muted-foreground mt-4 font-medium uppercase tracking-widest flex items-center gap-2">
                  {isFinished ? t('timer.timeUp') : isRunning ? t('timer.speaking') : t('timer.paused')}
                  {soundEnabled && <Bell className="h-3 w-3" />}
                </div>
                <Badge variant="outline" className="mt-2 text-xs max-w-[180px] truncate">
                  {t(currentSpeech.labelKey)}
                </Badge>
              </div>
            </div>

            <Progress value={progress} className="h-2 w-full" />

            {/* Controls */}
            <div className="flex justify-center gap-4">
              <Button
                size="lg"
                variant={isRunning ? "secondary" : "default"}
                className="h-16 w-32 text-xl shadow-lg"
                onClick={toggleTimer}
              >
                {isRunning ? (
                  <>
                    <Pause className="mr-2 h-6 w-6" /> {t('timer.pause')}
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-6 w-6" /> {t('timer.start')}
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-16 w-16 shadow-sm"
                onClick={resetTimer}
                aria-label={t('timer.resetKey', 'Reset timer')}
              >
                <RotateCcw className="h-6 w-6" />
              </Button>
            </div>

            <div className="text-xs text-muted-foreground pt-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
              <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> {t('timer.spaceStartStop')}</span>
              <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> {t('timer.resetKey')}</span>
              <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> {t('timer.arrowsChange')}</span>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8">
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" /> {t('timer.signals')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm flex flex-col sm:flex-row justify-center gap-2 sm:gap-8 text-muted-foreground items-center">
              <span className="flex items-center gap-2">{t('timer.oneMinLeft')}: <b>{t('timer.oneBeep')}</b></span>
              <span className="flex items-center gap-2">{t('timer.timeUpSignal')}: <b>{t('timer.twoBeeps')}</b></span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
